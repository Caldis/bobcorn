// Polyfill Node globals for browser context (contextIsolation: true)
import process from 'process';
globalThis.process = process;
import { Buffer } from 'buffer';
globalThis.Buffer = Buffer;

// Styles
import './styles/globals.css';
import './index.global.css';
// Bootstrap the app
import('./bootstrap');
