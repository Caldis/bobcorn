// ---------------------------------------------------------------------------
// Ambient module declarations for untyped third-party packages.
// This file must NOT contain top-level import/export so TypeScript treats it
// as a global declaration file.
// ---------------------------------------------------------------------------

declare module 'sql.js/dist/sql-asm.js' {
  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number>) => SqlJsDatabase;
  }
  interface SqlJsDatabase {
    run(sql: string, params?: any[]): SqlJsDatabase;
    exec(sql: string, params?: any[]): Array<{ columns: string[]; values: any[][] }>;
    prepare(sql: string): SqlJsStatement;
    export(): Uint8Array;
  }
  interface SqlJsStatement {
    step(): boolean;
    getAsObject(params?: Record<string, any>): Record<string, any>;
  }
  function initSqlJs(config?: Record<string, any>): Promise<SqlJsStatic>;
  export default initSqlJs;
}

declare module 'memory-fs' {
  class MemoryFileSystem {
    mkdirSync(path: string): void;
    mkdirpSync(path: string): void;
    rmdirSync(path: string): void;
    writeFileSync(path: string, content: string | Buffer): void;
    readFileSync(path: string, encoding?: string): string | Buffer;
    createReadStream(path: string): any;
    existsSync(path: string): boolean;
    statSync(path: string): any;
    unlinkSync(path: string): void;
  }
  export default MemoryFileSystem;
}

declare module 'svgicons2svgfont' {
  class SVGIcons2SVGFontStream {
    constructor(options?: Record<string, any>);
    on(event: string, listener: (...args: any[]) => void): this;
    write(chunk: any): boolean;
    end(): void;
  }
  export default SVGIcons2SVGFontStream;
}

declare module 'svg2ttf' {
  function svg2ttf(svgFont: string, options?: Record<string, any>): { buffer: ArrayBuffer };
  export default svg2ttf;
}

declare module 'ttf2woff' {
  function ttf2woff(ttfFont: Uint8Array, options?: Record<string, any>): { buffer: ArrayBuffer };
  export default ttf2woff;
}

declare module 'ttf2woff2' {
  function ttf2woff2(ttfFont: Uint8Array, options?: Record<string, any>): { buffer: ArrayBuffer };
  export default ttf2woff2;
}

declare module 'ttf2eot' {
  function ttf2eot(ttfFont: Uint8Array, options?: Record<string, any>): { buffer: ArrayBuffer };
  export default ttf2eot;
}
