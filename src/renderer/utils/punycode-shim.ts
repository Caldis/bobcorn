// Shim for punycode CJS API
// svgicons2svgfont 使用 require('punycode').ucs2.decode()
// 但 Vite 将 punycode ESM 模块打包后丢失了 ucs2 对象属性
// 此 shim 从 punycode 的 ESM 入口直接导入, 重新组装 ucs2 对象
// 注意: 导入路径必须是具体文件, 不能是 'punycode/' 否则会被 Vite alias 循环引用
import {
  ucs2decode,
  ucs2encode,
  decode,
  encode,
  toASCII,
  toUnicode,
} from 'punycode/punycode.es6.js';

export const ucs2 = { decode: ucs2decode, encode: ucs2encode };
export { decode, encode, toASCII, toUnicode };
export default { ucs2, decode, encode, toASCII, toUnicode };
