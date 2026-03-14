// SVG操作类

class SVG {
    constructor(svgString) {
        this.SVG = null;
        this.setSVG(svgString);
    }


    // 基本存取
    setSVG = (svgString) => {
	    // 清除掉多余的引号
	    svgString = svgString.replaceAll("\'", "\"");
	    svgString = svgString.replaceAll(/""(\S+)""/, "\"$1\"");
    	// 从字符串解析DOM对象
        const parser = new DOMParser();
        this.SVG = parser.parseFromString(svgString, "image/svg+xml").querySelector("svg");
        return this;
    };
    getSVG = () => {
        return this.SVG;
    };


    // HTML相关
    getInnerHTML = () => {
        return this.SVG.innerHTML;
    };
    getOuterHTML = () => {
        return this.SVG.outerHTML;
    };


    // viewBox相关
    setViewBox = (viewBox) => {
        // viewBox = "0 0 1024 1024"
        this.SVG.setAttribute("viewBox", viewBox);
        return this;
    };
    getViewBox = () => {
        return this.SVG.getAttribute("viewBox");
    };


    // style相关
	setStyle = (style) => {
		this.SVG.style = Object.assign({}, this.SVG.style, style);
		return this;
	};
	getStyle = () => {
		return this.SVG.style;
	};

    // xy相关
    delX = () => {
        this.SVG.removeAttribute("x");
        return this;
    };
    setX = (attr) => {
        // x = "0px"
        this.SVG.setAttribute("x", attr);
        return this;
    };
    getX = () => {
        return this.SVG.getAttribute("x");
    };
    delY = () => {
        this.SVG.removeAttribute("y");
        return this;
    };
    setY = (attr) => {
        // y = "0px"
        this.SVG.setAttribute("y", attr);
        return this;
    };
    getY = () => {
        return this.SVG.getAttribute("y");
    };


    // width height 相关
    delWidth = () => {
        this.SVG.removeAttribute("width");
        return this;
    };
    setWidth = (attr) => {
        // width = "0px"
        this.SVG.setAttribute("width", attr);
        return this;
    };
    getWidth = () => {
        return this.SVG.getAttribute("width");
    };
    delHeight = () => {
        this.SVG.removeAttribute("height");
        return this;
    };
    setHeight = (attr) => {
        // height = "0px"
        this.SVG.setAttribute("height", attr);
        return this;
    };
    getHeight = () => {
        return this.SVG.getAttribute("height");
    };


    // 格式化相关
    formatSVG = () => {
    	// 清除无用的内联样式
	    try {
	    	// 莫名其妙报错
		    const style = this.SVG.querySelector("style");
		    this.SVG.removeChild(style);
	    } catch (err) {}

        // 清除宽高, 重设xy
        this.delWidth().delHeight().setX("0px").setY("0px");

        // 格式化viewBox, 取最大的
        const viewBoxNum = this.getViewBox().split(' ');
        const viewBoxMax = Math.max(viewBoxNum[2], viewBoxNum[3]);
        this.setViewBox(`${viewBoxNum[0]} ${viewBoxNum[1]} ${viewBoxMax} ${viewBoxMax}`);

        return this;
    }
}

export default SVG;