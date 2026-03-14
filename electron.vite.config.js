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

// Plugin to fix CJS output in Electron renderer:
// 1. Remove type="module" from script tags (CJS doesn't use ES modules)
// 2. Inject CSS for async chunks (Vite only auto-injects in ESM mode)
function electronCjsHtmlPlugin() {
  return {
    name: 'electron-cjs-html',
    enforce: 'post',
    generateBundle(_, bundle) {
      // Collect all CSS files not already referenced in HTML
      this._extraCss = Object.keys(bundle).filter(f => f.endsWith('.css'))
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        // Remove module/crossorigin attrs
        html = html
          .replace(/ type="module" crossorigin/g, '')
          .replace(/ crossorigin/g, '')

        // Inject all chunk CSS files that aren't already in the HTML
        if (ctx?.bundle) {
          const cssFiles = Object.keys(ctx.bundle).filter(f => f.endsWith('.css'))
          for (const css of cssFiles) {
            if (!html.includes(css)) {
              html = html.replace('</head>', `  <link rel="stylesheet" href="./${css}">\n</head>`)
            }
          }
        }

        return html
      },
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
