import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import vitePluginImp from 'vite-plugin-imp'

// Node.js builtins that are used in renderer with nodeIntegration: true
const nodeBuiltins = [
  'electron',
  'fs', 'path', 'os', 'child_process', 'module', 'stream', 'util',
  'crypto', 'events', 'buffer', 'punycode',
]

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
        ],
        output: {
          format: 'cjs',
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
      vitePluginImp({
        libList: [
          {
            libName: 'antd',
            style: (name) => `antd/es/${name}/style/css.js`,
          },
        ],
      }),
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
