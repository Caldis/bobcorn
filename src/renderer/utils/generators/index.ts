// fs
import MemoryFileSystem from 'memory-fs';
const mfs = new MemoryFileSystem();
// converters
import svgicons2svgfont from 'svgicons2svgfont';
import svg2ttf from 'svg2ttf';
import ttf2woff from 'ttf2woff';
import ttf2woff2 from 'ttf2woff2';
import ttf2eot from 'ttf2eot';

// 转换路径
// svgIcon -> svgFont -> ttfFont -> woffFont
//                               \
//                                -> woff2Font
//                                \
//                                 -> eotFont

// data 是一个对象, 包含了导出所需的图标配置, 和 svg 文件的路径对象, 除 icons 外, 其余的参数都会直接传递给 svgicons2svgfont
// svgicons2svgfont 的文档可参见 https://github.com/nfroidure/svgicons2svgfont
// 一些基本配置:
// fontName: 默认('iconfont')  fontFamily的名字
// fontHeight: 默认('') 图标的高度
// descent: 默认(0) 基线高度
// normalize: 默认(false) 将icon归一化, 将图标高度调整为所有图标中高度最高的图标的值
// round: 默认(10e12) 功能未知
// 图标的配置
// icons: [{
//      iconName
//      iconCode
//      iconContent
// }]
// 参考 webfonts-generator
// https://github.com/sunflowerdeath/webfonts-generator/blob/master/src/generateFonts.js
export const svgFontGenerator = (data, callback) => {
    let font = new Buffer(0);
    // 提取出 svgicons2svgfont 的配置参数
    const { icons, options } = data;

    // 创建虚拟目录
    // 由于 svgicons2svgfont 仅能从 readStream 读取 svg 数据
    // 因此这里使用 memory-fs 创建虚拟文件流以便直接从对象读取数据
    // 建立虚拟目录
    mfs.mkdirSync("/svgFontGenerator");
    // 创建 svgicons2svgfont 的处理流
    const fontStream = svgicons2svgfont(options)
        .on('data', (data) => {
            font = Buffer.concat([font, data])
        })
        .on('end', () => {
            // 清掉虚拟目录
            mfs.rmdirSync("/svgFontGenerator");
            callback && callback(font.toString())
        });

    try {
        icons.forEach(icon => {
            const path = `/svgFontGenerator/${icon.iconCode}.svg`;
            mfs.writeFileSync(path, icon.iconContent.toString());
            fontStream.write(Object.assign(mfs.createReadStream(path), {
                metadata: {
                    // 名称不能相同, 因此此处拼接 iconCode 区分
                    name: `${icon.iconName}_${icon.iconCode}`,
                    // unicode转换相关
                    // http://www.ruanyifeng.com/blog/2014/12/unicode.html
                    // https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/String/fromCodePoint
                    unicode: [String.fromCodePoint(`0x${icon.iconCode}`)]
                }
            }))
        });
    } catch (err) {
        // 清掉虚拟目录
        mfs.rmdirSync("/svgFontGenerator");
        console.err(err);
    }

    fontStream.end()
};


// data 是一个对象, 包含了 svg2ttf 的配置, 以及 svgfont 数据
// ...
// svgfont svg字体文件
export const ttfFontGenerator = (data) => {
    const { svgFont, ...options } = data;
    let font = svg2ttf(svgFont, options);
    font = new Buffer(font.buffer);
    return font;
};


// data 是一个对象, 包含了 ttf2woff 的配置, 以及 ttfFont 数据
// ...
// ttfFont ttf字体文件
export const woffFontGenerator = (data) => {
    const { ttfFont, ...options } = data;
    let font = ttf2woff(new Uint8Array(ttfFont), options);
    font = new Buffer(font.buffer);
    return font;
};

// data 是一个对象, 包含了 ttf2woff2 的配置, 以及 ttfFont 数据
// ...
// ttfFont ttf字体文件
export const woff2FontGenerator = (data) => {
    const { ttfFont, ...options } = data;
    let font = ttf2woff2(new Uint8Array(ttfFont), options);
    font = new Buffer(font.buffer);
    return font;
};

// data 是一个对象, 包含了 ttf2woff2 的配置, 以及 ttfFont 数据
// ...
// ttfFont ttf字体文件
export const eotFontGenerator = (data) => {
    const { ttfFont, ...options } = data;
    let font = ttf2eot(new Uint8Array(ttfFont), options);
    font = new Buffer(font.buffer);
    return font;
};