import type { Either } from 'fp-ts/Either';
import type { Task } from 'fp-ts/Task';
import type { TaskEither } from 'fp-ts/TaskEither';
import type * as retry from 'retry-ts';

import type * as Assert from './assert';
import type * as AssertionError from './assertionError';
import type * as ShardingError from './shardingError';

export type { Assert, AssertionError, ShardingError };

export type Concurrency =
  | { readonly type: 'parallel' }
  | { readonly type: 'sequential'; readonly failFast?: false };

export type SingleTest = {
  readonly type: 'single';
  readonly name: string;
  readonly act: Task<Assert.Type>;
  readonly timeout?: number;
  readonly retry?: retry.RetryPolicy;
};

export type Group = {
  readonly type: 'group';
  readonly name: string;
  readonly concurrency?: Concurrency;
  readonly asserts: readonly SingleTest[];
};

export type TestUnit = Group | SingleTest;

export type TestConfig = { readonly concurrency?: Concurrency };

export type Change = { readonly type: '-' | '+' | '0'; readonly value: string };

export type DiffLines = (p: {
  readonly expected: string;
  readonly received: string;
}) => readonly Change[];

export type AssertionFailResult = { readonly name: string; readonly error: AssertionError.Type };

export type AssertionPassResult = { readonly name: string; readonly timeElapsedMs: number };

export type AssertionResult = Either<AssertionFailResult, AssertionPassResult>;

export type TestError =
  | AssertionError.Type
  | { readonly code: 'MultipleAssertionError'; readonly results: readonly AssertionResult[] };

export type TestFailResult = { readonly name: string; readonly error: TestError };

export type TestPassResult = { readonly name: string; readonly timeElapsedMs: number };

export type TestResult = Either<TestFailResult, TestPassResult>;

export type SuiteError =
  | { readonly type: 'DuplicateTestName'; readonly name: string }
  | { readonly type: 'ShardingError'; readonly value: ShardingError.Type }
  | { readonly type: 'TestError'; readonly results: readonly TestResult[] };

export type SuiteResult = Either<SuiteError, readonly TestPassResult[]>;

export type ShardingStrategy = (p: {
  readonly shardCount: number;
  readonly tests: readonly TestUnit[];
}) => TaskEither<ShardingError.ShardingStrategyError, readonly (readonly TestUnit[])[]>;

export type GetShardIndex = TaskEither<ShardingError.GetShardIndexError, number>;

export type GetShardCount = TaskEither<ShardingError.GetShardCountError, number>;
