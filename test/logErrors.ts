import { ioRef, readonlyArray, task } from 'fp-ts';
import { pipe } from 'fp-ts/function';

import { logErrorsF, runTests, test } from '../src';
import { testW } from '../src/test';

type Case = {
  readonly name: string;
  readonly actual: unknown;
  readonly expected: unknown;
  readonly log: string;
};

const caseToTest = (tc: Case) =>
  test({
    name: tc.name,
    act: pipe(
      task.Do,
      task.bind('logsRef', () => task.fromIO(ioRef.newIORef<readonly unknown[]>([]))),
      task.bind('env', ({ logsRef }) =>
        task.of({
          console: { log: (newLog: unknown) => logsRef.modify(readonlyArray.append(newLog)) },
        })
      ),
      task.chainFirst(({ env }) =>
        pipe(
          [
            testW({
              name: 'foo',
              act: task.of(tc.actual),
              assert: tc.expected,
            }),
          ],
          runTests({}),
          logErrorsF(env)
        )
      ),
      task.chainIOK(({ logsRef }) => logsRef.read)
    ),
    assert: [`\x1b[31m\x1b[1m\x1b[7m FAIL \x1b[27m\x1b[22m\x1b[39m foo\n${tc.log}`],
  });

const cases: readonly Case[] = [
  {
    name: 'minus diff is logged with minus(-) prefix and red(31) color',
    actual: { minus: 'minusValue' },
    expected: {},
    log:
      `\x1b[32m- {}\x1b[39m\n` +
      `\x1b[31m+ {\x1b[39m\n` +
      `\x1b[31m+   "minus": "minusValue"\x1b[39m\n` +
      `\x1b[31m+ }\x1b[39m`,
  },

  {
    name: 'plus diff is logged with plus(+) prefix and green(32) color',
    actual: {},
    expected: { plus: 'plusValue' },
    log:
      `\x1b[32m- {\x1b[39m\n` +
      `\x1b[32m-   "plus": "plusValue"\x1b[39m\n` +
      `\x1b[32m- }\x1b[39m\n` +
      `\x1b[31m+ {}\x1b[39m`,
  },

  {
    name: 'can use undefined in actual',
    actual: { minus: 'minusValue' },
    expected: undefined,
    log:
      `\x1b[32m- undefined\x1b[39m\n` +
      `\x1b[31m+ {\x1b[39m\n` +
      `\x1b[31m+   "minus": "minusValue"\x1b[39m\n` +
      `\x1b[31m+ }\x1b[39m`,
  },

  {
    name: 'can use undefined in expected',
    actual: undefined,
    expected: { plus: 'plusValue' },
    log:
      `\x1b[32m- {\x1b[39m\n` +
      `\x1b[32m-   "plus": "plusValue"\x1b[39m\n` +
      `\x1b[32m- }\x1b[39m\n` +
      `\x1b[31m+ undefined\x1b[39m`,
  },

  {
    name: 'can use undefined in actual',
    actual: { minus: 'minusValue' },
    expected: undefined,
    log:
      `\x1b[32m- undefined\x1b[39m\n` +
      `\x1b[31m+ {\x1b[39m\n` +
      `\x1b[31m+   "minus": "minusValue"\x1b[39m\n` +
      `\x1b[31m+ }\x1b[39m`,
  },

  {
    name: 'can use undefined in expected',
    actual: undefined,
    expected: { plus: 'plusValue' },
    log:
      `\x1b[32m- {\x1b[39m\n` +
      `\x1b[32m-   "plus": "plusValue"\x1b[39m\n` +
      `\x1b[32m- }\x1b[39m\n` +
      `\x1b[31m+ undefined\x1b[39m`,
  },

  {
    name: 'can differentiate actual undefined and expected string "undefined"',
    actual: 'undefined',
    expected: undefined,
    log: `\x1b[32m- undefined\x1b[39m\n` + `\x1b[31m+ "undefined"\x1b[39m`,
  },

  {
    name: 'can differentiate actual string "undefined" and expected undefined',
    actual: undefined,
    expected: 'undefined',
    log: `\x1b[32m- "undefined"\x1b[39m\n` + `\x1b[31m+ undefined\x1b[39m`,
  },
];

export const tests = readonlyArray.map(caseToTest)(cases);
