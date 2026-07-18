declare const __APP_VERSION__: string;

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.svg' {
  const src: string;
  export default src;
}

declare module '*.jpg' {
  const src: string;
  export default src;
}

declare global {
  interface Window {
    // Single-sourced from the preload script — the object actually exposed
    // via contextBridge. See src/preload/index.ts `export type ElectronAPI`.
    electronAPI: import('../preload/index').ElectronAPI;
  }
}

export {};
