import type { Either } from 'fp-ts/Either';
import type { TaskEither } from 'fp-ts/TaskEither';

import type * as Assert from './assert';
import type * as ShardingError from './shardingError';
import type * as SuiteError from './suiteError';
import type * as TestError from './testError';
import type * as TestUnit from './testUnit';
import type * as TestUnitError from './testUnitError';
import type * as TestUnitSuccess from './testUnitSuccess';

export type {
  Assert,
  ShardingError,
  SuiteError,
  TestError,
  TestUnit,
  TestUnitError,
  TestUnitSuccess,
};

export type Named<T> = { readonly name: string; readonly value: T };

export type TestSuccess = { readonly name: string; readonly timeElapsedMs: number };

export type TestFail = { readonly name: string; readonly value: TestError.Union };

export type TestResult = Either<Named<TestError.Union>, TestSuccess>;

export type TestUnitRight = { readonly name: string; readonly value: TestUnitSuccess.Union };

export type TestUnitLeft = { readonly name: string; readonly value: TestUnitError.Union };

export type TestUnitResult = Either<TestUnitLeft, TestUnitRight>;

export type SuiteResult = Either<SuiteError.Union, readonly TestUnitRight[]>;

export type Concurrency =
  | { readonly type: 'parallel' }
  | { readonly type: 'sequential'; readonly failFast?: false };

export type TestConfig = { readonly concurrency?: Concurrency };

export type Change = { readonly type: '-' | '+' | '0'; readonly value: string };

export type DiffLines = (p: {
  readonly expected: string;
  readonly received: string;
}) => readonly Change[];

export type ShardingStrategy = (p: {
  readonly shardCount: number;
  readonly tests: readonly TestUnit.Union[];
}) => TaskEither<ShardingError.ShardingStrategyError, readonly (readonly TestUnit.Union[])[]>;

export type GetShardIndex = TaskEither<ShardingError.GetShardIndexError, number>;

export type GetShardCount = TaskEither<ShardingError.GetShardCountError, number>;
