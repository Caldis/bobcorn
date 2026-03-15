// SVG操作类

class SVG {
    SVG: SVGSVGElement | null;

    constructor(svgString: string) {
        this.SVG = null;
        this.setSVG(svgString);
    }


    // 基本存取
    setSVG = (svgString: string): this => {
	    // 清除掉多余的引号
	    svgString = svgString.replaceAll("\'", "\"");
	    svgString = svgString.replaceAll(/""(\S+)""/, "\"$1\"");
    	// 从字符串解析DOM对象
        const parser = new DOMParser();
        this.SVG = parser.parseFromString(svgString, "image/svg+xml").querySelector("svg");
        return this;
    };
    getSVG = (): SVGSVGElement | null => {
        return this.SVG;
    };


    // HTML相关
    getInnerHTML = (): string => {
        return this.SVG!.innerHTML;
    };
    getOuterHTML = (): string => {
        return this.SVG!.outerHTML;
    };


    // viewBox相关
    setViewBox = (viewBox: string): this => {
        // viewBox = "0 0 1024 1024"
        this.SVG!.setAttribute("viewBox", viewBox);
        return this;
    };
    getViewBox = (): string | null => {
        return this.SVG!.getAttribute("viewBox");
    };


    // style相关
	setStyle = (style: Partial<CSSStyleDeclaration>): this => {
		(this.SVG as any).style = Object.assign({}, this.SVG!.style, style);
		return this;
	};
	getStyle = (): CSSStyleDeclaration => {
		return this.SVG!.style;
	};

    // xy相关
    delX = (): this => {
        this.SVG!.removeAttribute("x");
        return this;
    };
    setX = (attr: string): this => {
        // x = "0px"
        this.SVG!.setAttribute("x", attr);
        return this;
    };
    getX = (): string | null => {
        return this.SVG!.getAttribute("x");
    };
    delY = (): this => {
        this.SVG!.removeAttribute("y");
        return this;
    };
    setY = (attr: string): this => {
        // y = "0px"
        this.SVG!.setAttribute("y", attr);
        return this;
    };
    getY = (): string | null => {
        return this.SVG!.getAttribute("y");
    };


    // width height 相关
    delWidth = (): this => {
        this.SVG!.removeAttribute("width");
        return this;
    };
    setWidth = (attr: string): this => {
        // width = "0px"
        this.SVG!.setAttribute("width", attr);
        return this;
    };
    getWidth = (): string | null => {
        return this.SVG!.getAttribute("width");
    };
    delHeight = (): this => {
        this.SVG!.removeAttribute("height");
        return this;
    };
    setHeight = (attr: string): this => {
        // height = "0px"
        this.SVG!.setAttribute("height", attr);
        return this;
    };
    getHeight = (): string | null => {
        return this.SVG!.getAttribute("height");
    };


    // 格式化相关
    formatSVG = (): this => {
    	// 清除无用的内联样式
	    try {
	    	// 莫名其妙报错
		    const style = this.SVG!.querySelector("style");
		    this.SVG!.removeChild(style!);
	    } catch (err) {}

        // 清除宽高, 重设xy
        this.delWidth().delHeight().setX("0px").setY("0px");

        // 格式化viewBox, 取最大的
        const viewBoxNum = this.getViewBox()!.split(' ');
        const viewBoxMax = Math.max(Number(viewBoxNum[2]), Number(viewBoxNum[3]));
        this.setViewBox(`${viewBoxNum[0]} ${viewBoxNum[1]} ${viewBoxMax} ${viewBoxMax}`);

        return this;
    }
}

export default SVG;
