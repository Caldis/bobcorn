import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
// vite-plugin-imp removed: antd 3 not compatible, using full CSS import instead

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: resolve(__dirname, 'app/main.dev.js'),
        output: {
          entryFileNames: 'index.js',
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: resolve(__dirname, 'app/preload.js'),
        output: {
          entryFileNames: 'preload.js',
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'app'),
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      rollupOptions: {
        input: resolve(__dirname, 'app/index.html'),
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js',
          assetFileNames: '[name][extname]',
        },
      },
    },
    esbuild: {
      jsx: 'automatic',
      include: /\.(m?ts|[jt]sx|js)$/,
      exclude: [],
      loader: 'jsx',
    },
    plugins: [
      react(),
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'app'),
        // Polyfill Node builtins for browser context
        'stream': 'stream-browserify',
        'punycode': 'punycode/',
        'events': 'events',
      },
    },
    define: {
      // Provide Buffer global via the buffer package
      'global': 'globalThis',
    },
    css: {
      modules: {
        localsConvention: 'camelCaseOnly',
        generateScopedName: '[name]__[local]__[hash:base64:5]',
      },
    },
  },
})
