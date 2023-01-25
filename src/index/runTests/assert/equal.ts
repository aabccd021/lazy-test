import {
  apply,
  boolean,
  either,
  readonlyArray,
  readonlyNonEmptyArray,
  readonlyRecord,
  string,
} from 'fp-ts';
import type { Either } from 'fp-ts/Either';
import { flow, pipe } from 'fp-ts/function';
import type { ReadonlyNonEmptyArray } from 'fp-ts/ReadonlyNonEmptyArray';
import * as iots from 'io-ts';

import { diffLines } from '../../_internal/libs/diffLines';
import type { Change, TestError } from '../../type';
import { testError } from '../../type';

const indent = (line: string): string => `  ${line}`;

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
          readonlyArray.traverseWithIndex(either.Applicative)((index, value) =>
            unknownToLines([...path, index])(value)
          ),
          either.map(
            flow(
              readonlyArray.chain(readonlyNonEmptyArray.modifyLast((last) => `${last},`)),
              readonlyArray.map(indent),
              (lines) => [`[`, ...lines, `]`]
            )
          )
        )
      : pipe(
          obj,
          iots.UnknownRecord.decode,
          either.mapLeft(() => testError.serializationError(path)),
          either.chain(
            readonlyRecord.traverseWithIndex(either.Applicative)((index, value) =>
              unknownToLines([...path, index])(value)
            )
          ),
          either.map(
            flow(
              readonlyRecord.foldMapWithIndex(string.Ord)(readonlyArray.getMonoid<string>())(
                (key, value) =>
                  pipe(
                    value,
                    readonlyNonEmptyArray.modifyHead((head) => `"${key}": ${head}`),
                    readonlyNonEmptyArray.modifyLast((last) => `${last},`)
                  )
              ),
              readonlyArray.map(indent),
              (lines) => [`{`, ...lines, `}`]
            )
          )
        );

export const equal = ({
  received,
  expected,
}: {
  readonly received: unknown;
  readonly expected: unknown;
}): Either<TestError.AssertionError | TestError.SerializationError, readonly Change[]> =>
  pipe(
    { received, expected },
    readonlyRecord.map(
      flow(unknownToLines([]), either.map(readonlyArray.intercalate(string.Monoid)('\n')))
    ),
    apply.sequenceS(either.Apply),
    either.map(diffLines),
    either.chainW(
      either.fromPredicate(
        readonlyArray.foldMap(boolean.MonoidAll)((change: Change) => change.type === '0'),
        (changes) => testError.assertionError({ changes, received, expected })
      )
    )
  );
