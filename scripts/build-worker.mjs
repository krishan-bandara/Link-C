// Bundles worker/index.ts into dist/worker.mjs so the image needs no tsx at runtime.
import { build } from 'esbuild';

await build({
  entryPoints: ['worker/index.ts'],
  outfile: 'dist/worker.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  tsconfig: 'tsconfig.json', // resolves the @/ alias
  sourcemap: false,
  // sharp is native; keep it external (installed in the image's node_modules if the worker imports it).
  external: ['sharp'],
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: 'info',
});
