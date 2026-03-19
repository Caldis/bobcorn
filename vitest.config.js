import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  test: {
    include: ['test/**/*.test.{js,ts}'],
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/renderer/**/*.{js,jsx}'],
      exclude: ['**/*.module.css', '**/*.test.*'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
    },
  },
  // Ensure ?raw imports work for all file types including .css
  css: {
    modules: false,
  },
})
