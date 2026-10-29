import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default {
  cacheDir: join(tmpdir(), 'import-test-vite'),
  test: { globals: true, include: ['validate.spec.ts'] },
};
