import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
// vite-plugin-imp removed: antd 3 not compatible, using full CSS import instead

// Node.js builtins that are used in renderer with nodeIntegration: true
const nodeBuiltins = [
  'electron',
  'fs', 'path', 'os', 'child_process', 'module', 'stream', 'util',
  'crypto', 'events', 'buffer', 'punycode',
]

// Plugin to fix CJS output in Electron renderer: remove type="module" from script tags
function electronCjsHtmlPlugin() {
  return {
    name: 'electron-cjs-html',
    enforce: 'post',
    transformIndexHtml(html) {
      return html
        .replace(/ type="module" crossorigin/g, '')
        .replace(/ crossorigin/g, '')
    },
  }
}

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
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'app'),
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      rollupOptions: {
        input: resolve(__dirname, 'app/index.html'),
        external: [
          ...nodeBuiltins,
          /^electron\/.*/,
          'sql.js',  // sql.js uses `this` as global scope in IIFE, breaks in strict CJS bundle
        ],
        output: {
          format: 'cjs',
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
      electronCjsHtmlPlugin(),
      react(),
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'app'),
      },
    },
    css: {
      modules: {
        localsConvention: 'camelCaseOnly',
        generateScopedName: '[name]__[local]__[hash:base64:5]',
      },
    },
  },
})
