import type { LeftOf, SuiteResult, TestResult } from '@src';
import { assert, group, runTests, test } from '@src';
import { either, option, readonlyArray, task, taskEither } from 'fp-ts';
import { pipe } from 'fp-ts/function';

type TestCase = {
  readonly name: string;
  readonly failFast: false | undefined;
  readonly errorAfterFailedTest: readonly TestResult[];
};

const caseToTest = (tc: TestCase) =>
  test({
    name: tc.name,
    act: pipe(
      taskEither.right([
        group({
          name: 'sequential group test',
          concurrency: { type: 'sequential', failFast: tc.failFast },
          asserts: [
            test({ name: 'should pass', act: pipe('foo', assert.equal('foo'), task.of) }),
            test({
              name: 'should fail',
              act: pipe(option.none, assert.option(assert.equal('foo')), task.of),
            }),
            test({
              name: 'after fail',
              act: pipe(option.none, assert.option(assert.equal('foo')), task.of),
            }),
          ],
        }),
      ]),
      runTests({}),
      assert.taskEitherLeft(
        assert.equalDeepPartial<LeftOf<SuiteResult>>({
          type: 'TestRunError',
          results: [
            either.left({
              name: 'sequential group test',
              error: {
                code: 'GroupError',
                results: [
                  either.right({ name: 'should pass' }),
                  either.left({ name: 'should fail', error: { code: 'UnexpectedNone' } }),
                  ...tc.errorAfterFailedTest,
                ],
              },
            }),
          ],
        })
      )
    ),
  });

const cases: readonly TestCase[] = [
  {
    name: 'fail fast sequential should skip test after failing',
    failFast: undefined,
    errorAfterFailedTest: [],
  },
  {
    name: 'non fail fast sequential should run all tests',
    failFast: false,
    errorAfterFailedTest: [either.left({ name: 'after fail', error: { code: 'UnexpectedNone' } })],
  },
];

export const tests = readonlyArray.map(caseToTest)(cases);
