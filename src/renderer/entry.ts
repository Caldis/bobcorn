// Polyfill Node globals for browser context (contextIsolation: true)
import process from 'process';
globalThis.process = process;
import { Buffer } from 'buffer';
globalThis.Buffer = Buffer;

// i18n (must initialize before React mounts)
import './i18n';

// Bundled fonts (local, offline — never a CDN). Latin subset only:
// CJK text intentionally falls back to the system font stack (see tailwind.config.js).
// Must load before globals.css so @font-face is registered before `font-sans` applies.
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/cascadia-code/latin-400.css';
import '@fontsource/cascadia-code/latin-500.css';
import '@fontsource/cascadia-code/latin-600.css';

// Styles
import './styles/globals.css';
import './index.global.css';
// Bootstrap the app
import('./bootstrap');
