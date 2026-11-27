// `pnpm dev` for the API (audit B33).
//
// tsx/esbuild emit no decorator metadata, so Nest constructor injection was undefined at
// runtime under `tsx watch`. This compiles with tsc (which emits it) and restarts node on
// every successful rebuild. Cross-platform: no shell `&`, no extra dependencies.
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const tsc = require.resolve('typescript/bin/tsc');
const project = ['-p', 'tsconfig.build.json'];

// One full build first, so node never starts against a stale or missing dist/.
const first = spawnSync(process.execPath, [tsc, ...project], { stdio: 'inherit' });
if (first.status !== 0) process.exit(first.status ?? 1);

const children = [
  spawn(process.execPath, [tsc, ...project, '--watch', '--preserveWatchOutput'], {
    stdio: 'inherit',
  }),
  spawn(process.execPath, ['--watch-path=dist', '--enable-source-maps', 'dist/main.js'], {
    stdio: 'inherit',
  }),
];

const stop = () => {
  for (const child of children) child.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) child.on('exit', (code) => code && stop());
