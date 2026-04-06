import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: false,
  clean: true,
  treeshake: true,
  minify: false,
  target: 'es2020',
  outDir: 'dist',
  noExternal: ['@noble/ed25519', '@noble/hashes'],
});

