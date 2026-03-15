// ── Type augmentations for prototype extensions ─────────────────

declare global {
  interface String {
    replaceAll(search: string, replacement: string): string;
  }
  interface Array<T> {
    remove(val: T): T[] | undefined;
    unique(): T[];
  }
  interface Date {
    Format(fmt: string): string;
  }
  interface Window {
    keyEvent: ((this: GlobalEventHandlers, ev: KeyboardEvent) => any) | null;
    keyTrigger: (() => void) | null;
  }
}

// 生成随机字符串
export const getRandomString = (): string => {
    return Math.random().toString(36).substr(2);
};


// 获取一个 UUID
export const generateUUID = (): string => {
    let d = new Date().getTime();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (d + Math.random()*16)%16 | 0;
        d = Math.floor(d/16);
        return (c==="x" ? r : (r&0x7|0x8)).toString(16);
    });
};

// 空格检测
// 当字符串不为空，且不包含空格时返回 true
// 当传入的参数 all 为 true 时，提高容忍度，允许出现部分空格，仅在全为空格时会返回 false
export const isnContainSpace = (string: string | null | undefined, all?: boolean): boolean => {
    if (string) {
        if (all) {
            return !string.match(/^\s+$/)
        } else {
            return string.indexOf(" ")===-1
        }
    } else {
        return false
    }
}

// 节流函数
// delay 时间内连续触发的调用, 只有最后一个会执行
export const throttle = (callback: (...args: any[]) => void, delay: number): ((...args: any[]) => void) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return function(this: any, ...args: any[]) {
        const context = this;
        clearTimeout(timer!);
        timer = setTimeout(function() {
            callback.apply(context, args);
        }, delay);
    };
};
// 节流函数, 带必须触发时间参数
// delay 间隔内连续触发的调用，后一个调用会把前一个调用的等待处理掉，但每隔 mustRunDelay 至少执行一次。
export const throttleMustRun = (callback: (...args: any[]) => void, delay: number, mustRunDelay: number): ((...args: any[]) => void) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let t_start: number | undefined;
    return function(this: any, ...args: any[]) {
        const context = this;
        const t_curr = +new Date();
        clearTimeout(timer!);
        if(!t_start){
            t_start = t_curr;
        }
        if(t_curr - t_start >= mustRunDelay){
            callback.apply(context, args);
            t_start = t_curr;
        }
        else {
            timer = setTimeout(function(){
                callback.apply(context, args);
            }, delay);
        }
    };
};

// 监听键盘事件
export const listenKeyDown = (keyCode: number, cb: () => void): void => {
    if(!window.keyEvent) {
        window.keyEvent = document.onkeydown;
        document.onkeydown = (e) => handleKeyDown(e, keyCode);
    } else {
        document.onkeydown = (e) => handleKeyDown(e, keyCode);
    }
    window.keyTrigger = cb;
};
// 取消监听键盘事件
export const unListenKeyDown = (): void => {
    if(window.keyEvent) {
        document.onkeydown = window.keyEvent;
        window.keyEvent = null;
    } else {
        document.onkeydown = null;
    }
    window.keyTrigger = null;
};
function handleKeyDown(e: KeyboardEvent, keyCode: number): void {
    //keyCode 13 = Enter Key
    if (e.keyCode === keyCode) {
        window.keyTrigger!();
    }
}

// [字符串] 新增方法, 替换字符串中指定字符
String.prototype.replaceAll = function(search: string, replacement: string): string {
	const target = this;
	return target.replace(new RegExp(search, 'g'), replacement);
};

// [数组]新增方法, 移除数组中某个元素, 不会修改原数组
Array.prototype.remove = function<T>(this: T[], val: T): T[] | undefined {
    const index = this.indexOf(val);
    if (index > -1) {
        return this.slice(0, index).concat(this.slice(index+1, this.length))
    }
};
// [数组]新增方法, 数组去重, 不会修改原数组
Array.prototype.unique = function<T>(this: T[]): T[] {
	return Array.from(new Set(this));
};

// 格式化日期输出, 对Date的扩展，将 Date 转化为指定格式的String
// 月(M)、日(d)、小时(h)、分(m)、秒(s)、季度(q) 可以用 1-2 个占位符，
// 年(y)可以用 1-4 个占位符，毫秒(S)只能用 1 个占位符(是 1-3 位的数字)
// 例子：
// (new Date()).Format("yyyy-MM-dd hh:mm:ss.S") ==> 2006-07-02 08:09:04.423
// (new Date()).Format("yyyy-M-d h:m:s.S")      ==> 2006-7-2 8:9:4.18
Date.prototype.Format = function(fmt: string): string {
    const o: Record<string, number> = {
        "M+" : this.getMonth()+1,                 //月份
        "d+" : this.getDate(),                    //日
        "h+" : this.getHours(),                   //小时
        "m+" : this.getMinutes(),                 //分
        "s+" : this.getSeconds(),                 //秒
        "q+" : Math.floor((this.getMonth()+3)/3), //季度
        "S"  : this.getMilliseconds()             //毫秒
    };
    if(/(y+)/.test(fmt)) {
        fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
    }
    for(const k in o) {
        if (new RegExp("(" + k + ")").test(fmt)) {
            fmt = fmt.replace(RegExp.$1, (RegExp.$1.length === 1) ? (String(o[k])) : (("00" + o[k]).substr(("" + o[k]).length)));
        }
    }
    return fmt;
};
// 直接格式化日期方法
export const formatDate = (date: string | number | Date, formatter?: string): string => {
    return (new Date(date)).Format(formatter || "yyyy.MM.dd")
};

// 普通事件工具类
export const LocalEvent = {
    // 添加绑定
    addEvent: (object: EventTarget | null | undefined, type: string, callback: EventListenerOrEventListenerObject): void => {
        if (object === null || typeof(object) === 'undefined') return;
        if ((object as EventTarget).addEventListener) {
            (object as EventTarget).addEventListener(type, callback, false);
        } else if ((object as any).attachEvent) {
            (object as any).attachEvent("on" + type, callback);
        } else {
            (object as any)["on"+type] = callback;
        }
    },
    // 移除绑定
    removeEvent: (object: EventTarget | null | undefined, type: string, callback: EventListenerOrEventListenerObject): void => {
        if (object === null || typeof(object) === 'undefined') return;
        if ((object as EventTarget).removeEventListener) {
            (object as EventTarget).removeEventListener(type, callback, false);
        } else if ((object as any).detachEvent) {
            (object as any).detachEvent("on" + type, callback);
        } else {
            (object as any)["on"+type] = callback;
        }
    }
};

// 前后添加单引号
// sf = stringify
export const sf = (text: string): string => {
    return `'${text}'`
};

// 禁止页面接受拖拽事件
export const preventDrop = (): void => {
    document.addEventListener('drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
    });
    document.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.stopPropagation();
    });
};

// 从文件路径获取文件名
export const nameOfPath = (path: string | null | undefined): string => {
    if (path) {
        const splitUnix = path.split("\/");
        const splitWin32 = path.split("\\");
        const splitArr = splitUnix.length>splitWin32.length ? splitUnix : splitWin32;
        return splitArr[splitArr.length - 1];
    } else {
        return "";
    }
};
// 从文件名获取文件名称
export const nameOfFile = (fullName: string): string => {
    return fullName.replace(/\.\w+$/,"");
};
// 从文件名获取文件后缀
export const typeOfFile = (fullName: string): string => {
    return /\.[^\.]+$/.exec(fullName)![0].replace(/\./,"").toLowerCase();
};

// 从字符串获取文件大小
export const sizeOfString = (string: string): number => {
	return Buffer.byteLength(string, 'utf8');
};

// 16进制转10
export const hexToDec = (decNumber: string): number => {
    return parseInt(decNumber, 16);
};
// 10进制转16
export const decToHex = (decNumber: number): string => {
    return decNumber.toString(16).toUpperCase();
};

// 禁用掉 Chrome(Electron?) 内的 button 自动 focus 效果
export const disableChromeAutoFocus = (): void => {
    // const blurList = ["[object HTMLUListElement]", "[object HTMLButtonElement]"];
    document.addEventListener('click', () => {
        if((document.activeElement as HTMLElement).toString() === "[object HTMLButtonElement]") {
            (document.activeElement as HTMLElement).blur();
        }
    });
};

// 获取系统
// darwin, win32
const currentPlatform: string = window.electronAPI ? window.electronAPI.platform : 'unknown'
export const platform = (): string => currentPlatform
