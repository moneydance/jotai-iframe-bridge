import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.tsx'],
  format: ['cjs', 'esm'],
  clean: true,
  external: ['react', 'react-dom', 'jotai', 'jotai-effect'],
  outDir: 'dist',
  dts: false, // Let TypeScript handle declaration generation directly
  outExtension({ format }) {
    return {
      js: format === 'cjs' ? '.js' : '.mjs',
    }
  },
})
