import * as src from '@src';

import * as concurrency from './concurrency';

export const tests = src.test.scope({ concurrency });
