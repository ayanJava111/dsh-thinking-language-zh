import { defineConfig } from 'tsdown'

/**
 * Self-contained build for the published entry: transpiles `src/` to `lib/`
 * without project references or type-checking, so the `prepare` script also
 * works when the package is installed from a git checkout where no monorepo
 * context exists. `typecheck` stays a separate script.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: true,
  clean: true,
})
