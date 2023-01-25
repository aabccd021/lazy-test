import {
    apply,
    boolean,
    either,
    readonlyArray,
    readonlyNonEmptyArray,
    readonlyRecord,
    string,
    task,
    taskEither
} from 'fp-ts';
import type { Either } from 'fp-ts/Either';
import { pipe } from 'fp-ts/function';
import type { ReadonlyNonEmptyArray } from 'fp-ts/ReadonlyNonEmptyArray';
import type { ReadonlyRecord } from 'fp-ts/ReadonlyRecord';
import type { Task } from 'fp-ts/Task';
import type { TaskEither } from 'fp-ts/TaskEither';
import * as iots from 'io-ts';
import * as retry from 'retry-ts';
import { retrying } from 'retry-ts/lib/Task';
import { match } from 'ts-pattern';

import type {
    Assert,
    Change,
    Concurrency,
    Named,
    SuiteError,
    SuiteResult,
    TestConfig,
    TestError, TestResult,
    TestSuccess,
    TestUnit,
    TestUnitLeft,
    TestUnitResult,
    TestUnitRight
} from './type';
import { diffLines } from './_internal/libs/diffLines';

const indent = (line: string): string => `  ${line}`;

const arrayToLines = (
  arr: readonly ReadonlyNonEmptyArray<string>[]
): ReadonlyNonEmptyArray<string> =>
  pipe(
    arr,
    readonlyArray.chain(readonlyNonEmptyArray.modifyLast((last) => `${last},`)),
    readonlyArray.map(indent),
    (lines) => [`[`, ...lines, `]`]
  );

const recordEntryToLines = (
  key: string,
  value: ReadonlyNonEmptyArray<string>
): ReadonlyNonEmptyArray<string> =>
  pipe(
    value,
    readonlyNonEmptyArray.modifyHead((head) => `"${key}": ${head}`),
    readonlyNonEmptyArray.modifyLast((last) => `${last},`)
  );

const recordFoldMapSortByKey = readonlyRecord.foldMapWithIndex(string.Ord);

const recordToLines = (
  record: ReadonlyRecord<string, ReadonlyNonEmptyArray<string>>
): ReadonlyNonEmptyArray<string> =>
  pipe(
    record,
    recordFoldMapSortByKey(readonlyArray.getMonoid<string>())(recordEntryToLines),
    readonlyArray.map(indent),
    (lines) => [`{`, ...lines, `}`]
  );

const traverseEitherArrayWithIndex = readonlyArray.traverseWithIndex(either.Applicative);

const traverseEitherRecordWithIndex = readonlyRecord.traverseWithIndex(either.Applicative);

const unknownToLines =
  (path: readonly (number | string)[]) =>
  (obj: unknown): Either<TestError.SerializationError, ReadonlyNonEmptyArray<string>> =>
    typeof obj === 'boolean' || typeof obj === 'number' || typeof obj === 'string' || obj === null
      ? either.right([JSON.stringify(obj)])
      : obj === undefined
      ? either.right(['undefined'])
      : Array.isArray(obj)
      ? pipe(
          obj,
          traverseEitherArrayWithIndex((index, value) => unknownToLines([...path, index])(value)),
          either.map(arrayToLines)
        )
      : pipe(
          obj,
          iots.UnknownRecord.decode,
          either.mapLeft(() => ({ code: 'SerializationError' as const, path })),
          either.chain(
            traverseEitherRecordWithIndex((index, value) => unknownToLines([...path, index])(value))
          ),
          either.map(recordToLines)
        );

const hasNoChange = readonlyArray.foldMap(boolean.MonoidAll)(
  (change: Change) => change.type === '0'
);

const assertionError =
  ({ received, expected }: { readonly received: unknown; readonly expected: unknown }) =>
  (changes: readonly Change[]): TestError.AssertionError => ({
    code: 'AssertionError' as const,
    changes,
    received,
    expected,
  });

const serialize = (value: unknown): Either<TestError.SerializationError, string> =>
  pipe(value, unknownToLines([]), either.map(readonlyArray.intercalate(string.Monoid)('\n')));

export const diffResult = (result: {
  readonly received: unknown;
  readonly expected: unknown;
}): Either<TestError.AssertionError | TestError.SerializationError, readonly Change[]> =>
  pipe(
    result,
    readonlyRecord.map(serialize),
    apply.sequenceS(either.Apply),
    either.map(diffLines),
    either.chainW(either.fromPredicate(hasNoChange, assertionError(result)))
  );

export const runAssert = (
  assert: Assert.Union
): Either<TestError.AssertionError | TestError.SerializationError, readonly Change[]> =>
  match(assert).with({ assert: 'Equal' }, diffResult).exhaustive();

const runSequentialFailFast =
  <T, L, R>(run: (t: T) => TaskEither<L, R>) =>
  (ts: readonly T[]): Task<readonly Either<L, R>[]> =>
    pipe(
      ts,
      readonlyArray.reduce(
        taskEither.of<readonly Either<L, R>[], readonly Either<L, R>[]>([]),
        (acc, el) =>
          pipe(
            acc,
            taskEither.chain((accr) =>
              pipe(
                el,
                run,
                taskEither.bimap(
                  (ell): readonly Either<L, R>[] => [...accr, either.left(ell)],
                  (elr): readonly Either<L, R>[] => [...accr, either.right(elr)]
                )
              )
            )
          )
      ),
      taskEither.toUnion
    );

const runSequential =
  <T, L, R>(run: (t: T) => TaskEither<L, R>) =>
  ({
    failFast,
  }: {
    readonly failFast?: false;
  }): ((tests: readonly T[]) => Task<readonly Either<L, R>[]>) =>
    match(failFast)
      .with(undefined, () => runSequentialFailFast(run))
      .with(false, () => readonlyArray.traverse(task.ApplicativeSeq)(run))
      .exhaustive();

const runWithConcurrency = <T, L, R>({
  concurrency,
  run,
}: {
  readonly concurrency: Concurrency | undefined;
  readonly run: (t: T) => TaskEither<L, R>;
}): ((ts: readonly T[]) => Task<readonly Either<L, R>[]>) =>
  match(concurrency)
    .with(undefined, () => readonlyArray.traverse(task.ApplicativePar)(run))
    .with({ type: 'parallel' }, () => readonlyArray.traverse(task.ApplicativePar)(run))
    .with({ type: 'sequential' }, runSequential(run))
    .exhaustive();

const unhandledException = (exception: unknown) => ({
  code: 'UnhandledException' as const,
  exception,
});

const runWithTimeout =
  <L, T>(timeout: TestUnit.Test['timeout']) =>
  (te: TaskEither<L, T>) =>
    task
      .getRaceMonoid<Either<L | TestError.TimedOut, T>>()
      .concat(
        te,
        pipe({ code: 'TimedOut' as const }, taskEither.left, task.delay(timeout ?? 5000))
      );

const runWithRetry =
  (retryConfig: TestUnit.Test['retry']) =>
  <L, R>(te: TaskEither<L, R>) =>
    retrying(retryConfig ?? retry.limitRetries(0), () => te, either.isLeft);

const measureElapsed =
  <L, R>(
    a: TaskEither<L, R>
  ): TaskEither<L, { readonly timeElapsedMs: number; readonly value: R }> =>
  async () => {
    const start = performance.now();
    const result = await a();
    const timeElapsedMs = performance.now() - start;
    return pipe(
      result,
      either.map((value) => ({ timeElapsedMs, value }))
    );
  };

const runTest = (test: TestUnit.Test): Task<TestResult> =>
  pipe(
    taskEither.tryCatch(test.act, unhandledException),
    measureElapsed,
    taskEither.chainEitherKW(({ timeElapsedMs, value }) =>
      pipe(
        value,
        runAssert,
        either.map(() => ({ timeElapsedMs }))
      )
    ),
    runWithTimeout(test.timeout),
    runWithRetry(test.retry),
    taskEither.bimap(
      (value: TestError.Union): Named<TestError.Union> => ({ name: test.name, value }),
      ({ timeElapsedMs }): TestSuccess => ({ timeElapsedMs, name: test.name })
    )
  );

const runGroupTests = (config: Pick<TestUnit.Group, 'concurrency'>) =>
  runWithConcurrency({ concurrency: config.concurrency, run: runTest });

const eitherArrayIsAllRight = <L, R>(
  arr: readonly Either<L, R>[]
): Either<readonly Either<L, R>[], readonly R[]> =>
  pipe(
    readonlyArray.rights(arr),
    either.fromPredicate(
      (rights) => readonlyArray.size(rights) === readonlyArray.size(arr),
      () => arr
    )
  );

const runGroup = (group: TestUnit.Group): TaskEither<TestUnitLeft, TestUnitRight> =>
  pipe(
    group.asserts,
    runGroupTests({ concurrency: group.concurrency }),
    task.map((testResults: readonly TestResult[]) =>
      pipe(
        testResults,
        eitherArrayIsAllRight,
        either.bimap(
          (results: readonly TestResult[]): TestUnitLeft => ({
            name: group.name,
            value: { code: 'GroupError' as const, results },
          }),
          (results: readonly TestSuccess[]): TestUnitRight => ({
            name: group.name,
            value: { unit: 'group', results },
          })
        )
      )
    )
  );

const runTestAsUnit = (test: TestUnit.Test): TaskEither<TestUnitLeft, TestUnitRight> =>
  pipe(
    test,
    runTest,
    taskEither.bimap(
      ({ name, value }: Named<TestError.Union>): TestUnitLeft => ({
        name,
        value: { code: 'TestError' as const, value },
      }),
      ({ name, timeElapsedMs }: TestSuccess): TestUnitRight => ({
        name,
        value: { unit: 'test' as const, timeElapsedMs },
      })
    )
  );

const runTestUnit = (testUnit: TestUnit.Union): TaskEither<TestUnitLeft, TestUnitRight> =>
  match(testUnit)
    .with({ type: 'test' }, runTestAsUnit)
    .with({ type: 'group' }, runGroup)
    .exhaustive();

const testUnitResultsToSuiteResult = (testUnitResults: readonly TestUnitResult[]): SuiteResult =>
  pipe(
    testUnitResults,
    eitherArrayIsAllRight,
    either.mapLeft((results) => ({ type: 'TestRunError' as const, results }))
  );

export const runTestUnits =
  (config: TestConfig) =>
  (tests: readonly TestUnit.Union[]): Task<SuiteResult> =>
    pipe(
      tests,
      runWithConcurrency({ concurrency: config.concurrency, run: runTestUnit }),
      task.map(testUnitResultsToSuiteResult)
    );

export const runTests =
  (config: TestConfig) =>
  (testsTE: TaskEither<SuiteError.Union, readonly TestUnit.Union[]>): Task<SuiteResult> =>
    pipe(testsTE, taskEither.chain(runTestUnits(config)));
