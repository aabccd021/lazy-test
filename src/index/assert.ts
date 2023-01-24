import { either as E, number, option as O, readonlyArray, readonlyRecord, task as T } from 'fp-ts';
import type { Either } from 'fp-ts/Either';
import { pipe } from 'fp-ts/function';
import type { Option } from 'fp-ts/Option';
import type { Task } from 'fp-ts/Task';
import type { TaskEither } from 'fp-ts/TaskEither';
import * as iots from 'io-ts';
import type { DeepPartial } from 'ts-essentials';

import type { Assert } from './type';

export const equal =
  <T>(expected: T) =>
  (received: T): Assert.Equal => ({ assert: 'Equal', expected, received });

export const equalW =
  (expected: unknown) =>
  (received: unknown): Assert.Equal => ({ assert: 'Equal', expected, received });

export const equalOption =
  <T>(expected: Option<T>) =>
  (received: Option<T>): Assert.Equal => ({ assert: 'Equal', expected, received });

export const equalEither =
  <L, R>(expected: Either<L, R>) =>
  (received: Either<L, R>): Assert.Equal => ({ assert: 'Equal', expected, received });

export const equalArray =
  <T>(expected: readonly T[]) =>
  (received: readonly T[]): Assert.Equal => ({ assert: 'Equal', expected, received });

export const numberArrayIsSortedAsc = (received: readonly number[]): Assert.Equal => ({
  assert: 'Equal',
  expected: readonlyArray.sort(number.Ord)(received),
  received,
});

const pick = (big: unknown, small: unknown): unknown =>
  Array.isArray(big) && Array.isArray(small)
    ? pipe(
        big,
        readonlyArray.mapWithIndex((bigIdx, bigV) =>
          pipe(
            small,
            readonlyArray.lookup(bigIdx),
            O.getOrElseW(() => undefined),
            (smallV) => pick(bigV, smallV)
          )
        )
      )
    : iots.UnknownRecord.is(big) && iots.UnknownRecord.is(small)
    ? pipe(
        small,
        readonlyRecord.filterMapWithIndex((smallIdx, smallV) =>
          pipe(
            big,
            readonlyRecord.lookup(smallIdx),
            O.map((bigV) => pick(bigV, smallV))
          )
        )
      )
    : big;

export const equalDeepPartial =
  <T>(expected: DeepPartial<T>) =>
  (received: T) =>
    pipe(pick(received, expected), equalW(expected));

const unexpectedNone: Assert.UnexpectedNone = { assert: 'UnexpectedNone' };

export const option =
  <A>(toAssert: (r: A) => Assert.Union) =>
  (e: Option<A>): Assert.Union =>
    pipe(
      e,
      O.match(() => unexpectedNone, toAssert)
    );

export const either =
  <L, R>(toAssert: (r: R) => Assert.Union) =>
  (e: Either<L, R>): Assert.Union =>
    E.isRight(e) ? toAssert(e.right) : equal({ _tag: 'Right' })(e);

export const eitherLeft =
  <L, R>(toAssert: (r: L) => Assert.Union) =>
  (e: Either<L, R>): Assert.Union =>
    E.isLeft(e) ? toAssert(e.left) : equal({ _tag: 'Left' })(e);

export const taskEither =
  <L, R>(toAssert: (r: R) => Assert.Union) =>
  (te: TaskEither<L, R>): Task<Assert.Union> =>
    pipe(
      te,
      T.map((e) => (E.isRight(e) ? toAssert(e.right) : equal({ _tag: 'Right' })(e)))
    );

export const taskEitherLeft =
  <L, R>(toAssert: (l: L) => Assert.Union) =>
  (te: TaskEither<L, R>): Task<Assert.Union> =>
    pipe(
      te,
      T.map((e) => (E.isLeft(e) ? toAssert(e.left) : equal({ _tag: 'Left' })(e)))
    );

export const task = T.map;
