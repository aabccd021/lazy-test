import { either, ioOption, option, readonlyArray, string, task } from 'fp-ts';
import { flow, pipe } from 'fp-ts/function';
import type { IO } from 'fp-ts/IO';
import type { Option } from 'fp-ts/Option';
import type { Task } from 'fp-ts/Task';
import c from 'picocolors';
import { modify } from 'spectacles-ts';
import { match } from 'ts-pattern';

import type { SuiteResult, TestUnitResult } from '../type';

const testResultsToSummaryStr = (testResults: readonly TestUnitResult[]): Option<string> =>
  pipe(
    testResults,
    readonlyArray.reduce({ passed: 0, failed: 0 }, (summaryAcc, testResult) =>
      pipe(
        testResult,
        either.match(
          () =>
            pipe(
              summaryAcc,
              modify('failed', (x) => x + 1)
            ),
          () =>
            pipe(
              summaryAcc,
              modify('passed', (x) => x + 1)
            )
        )
      )
    ),
    ({ passed, failed }) => [
      c.bold(c.inverse(' DONE ')),
      c.bold(c.green(`   Passed ${passed}`)),
      c.bold(c.red(`   Failed ${failed}`)),
      '',
    ],
    readonlyArray.intercalate(string.Monoid)('\n'),
    option.some
  );

export const logSummaryF = (env: {
  readonly console: { readonly log: (str: string) => IO<void> };
}): ((res: Task<SuiteResult>) => Task<SuiteResult>) =>
  task.chainFirstIOK(
    flow(
      either.match(
        (suiteError) =>
          match(suiteError)
            .with({ type: 'TestRunError' }, ({ results }) => testResultsToSummaryStr(results))
            .otherwise(() => option.none),
        flow(readonlyArray.map(either.right), testResultsToSummaryStr)
      ),
      ioOption.fromOption,
      ioOption.chainIOK(env.console.log)
    )
  );
