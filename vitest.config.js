import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  test: {
    include: ['test/**/*.test.{js,ts}'],
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'app'),
    },
  },
})
