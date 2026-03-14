// 生成随机字符串
export const getRandomString = () => {
    return Math.random().toString(36).substr(2);
};


// 获取一个 UUID
export const generateUUID = () => {
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
export const isnContainSpace = (string, all) => {
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
export const throttle = (callback, delay) => {
    let timer = null;
    return function() {
        let context = this, args = arguments;
        clearTimeout(timer);
        timer = setTimeout(function() {
            callback.apply(context, args);
        }, delay);
    };
};
// 节流函数, 带必须触发时间参数
// delay 间隔内连续触发的调用，后一个调用会把前一个调用的等待处理掉，但每隔 mustRunDelay 至少执行一次。
export const throttleMustRun = (callback, delay, mustRunDelay) => {
    let timer = null;
    let t_start;
    return function(){
        let context = this, args = arguments, t_curr = +new Date();
        clearTimeout(timer);
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
export const listenKeyDown = (keyCode, cb) => {
    if(!window.keyEvent) {
        window.keyEvent = document.onkeydown;
        document.onkeydown = (e) => handleKeyDown(e, keyCode);
    } else {
        document.onkeydown = (e) => handleKeyDown(e, keyCode);
    }
    window.keyTrigger = cb;
};
// 取消监听键盘事件
export const unListenKeyDown = () => {
    if(window.keyEvent) {
        document.onkeydown = window.keyEvent;
        window.keyEvent = null;
    } else {
        document.onkeydown = null;
    }
    window.keyTrigger = null;
};
function handleKeyDown(e, keyCode){
    //keyCode 13 = Enter Key
    if (e.keyCode === keyCode) {
        window.keyTrigger();
    }
}

// [字符串] 新增方法, 替换字符串中指定字符
String.prototype.replaceAll = function(search, replacement) {
	const target = this;
	return target.replace(new RegExp(search, 'g'), replacement);
};

// [数组]新增方法, 移除数组中某个元素, 不会修改原数组
Array.prototype.remove = function(val) {
    const index = this.indexOf(val);
    if (index > -1) {
        return this.slice(0, index).concat(this.slice(index+1, this.length))
    }
};
// [数组]新增方法, 数组去重, 不会修改原数组
Array.prototype.unique = function () {
	return Array.from(new Set(this));
};

// 格式化日期输出, 对Date的扩展，将 Date 转化为指定格式的String
// 月(M)、日(d)、小时(h)、分(m)、秒(s)、季度(q) 可以用 1-2 个占位符，
// 年(y)可以用 1-4 个占位符，毫秒(S)只能用 1 个占位符(是 1-3 位的数字)
// 例子：
// (new Date()).Format("yyyy-MM-dd hh:mm:ss.S") ==> 2006-07-02 08:09:04.423
// (new Date()).Format("yyyy-M-d h:m:s.S")      ==> 2006-7-2 8:9:4.18
Date.prototype.Format = function(fmt) {
    const o = {
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
    for(let k in o) {
        if (new RegExp("(" + k + ")").test(fmt)) {
            fmt = fmt.replace(RegExp.$1, (RegExp.$1.length === 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
        }
    }
    return fmt;
};
// 直接格式化日期方法
export const formatDate = (date, formatter) => {
    return (new Date(date)).Format(formatter || "yyyy.MM.dd")
};

// 普通事件工具类
export const LocalEvent = {
    // 添加绑定
    addEvent: (object, type, callback) => {
        if (object === null || typeof(object) === 'undefined') return;
        if (object.addEventListener) {
            object.addEventListener(type, callback, false);
        } else if (object.attachEvent) {
            object.attachEvent("on" + type, callback);
        } else {
            object["on"+type] = callback;
        }
    },
    // 移除绑定
    removeEvent:(object, type, callback) => {
        if (object === null || typeof(object) === 'undefined') return;
        if (object.removeEventListener) {
            object.removeEventListener(type, callback, false);
        } else if (object.detachEvent) {
            object.detachEvent("on" + type, callback);
        } else {
            object["on"+type] = callback;
        }
    }
};

// 全局事件工具类
// 放全局事件的对象
const eventDOM = document.querySelector('html');
// 默认配置项
const defaultOptions = { target: window, cleanBeforeAdd: true };
// 全局事件的回调函数引用
window["eventBin"] = {}; const eventBin = window.eventBin;
export const GlobalEvent = {
    // 添加对应事件的 Handler
    addEventHandler: (typeName, eventHandler, options) => {
        // target: 指定目标
        // cleanBeforeAdd: 先移除所有已有的同名事件再绑定
        const customOptions = Object.assign(defaultOptions, options);
        const { target, cleanBeforeAdd } = customOptions;
        // 初始化对应类型的全局事件的回调函数引用
        if (!eventBin[typeName]) eventBin[typeName] = [];
        // 如果传入 cleanBeforeAdd, 则先移除所有已有的同名事件再追加
        if (cleanBeforeAdd && eventBin[typeName].length) {
            eventBin[typeName].forEach(eventHandler => GlobalEvent.removeEventHandler(typeName, eventHandler));
            eventBin[typeName] = [];
        }
        // 保存 handler 的句柄, handler 接受的的参数是自定义函数中 detail 的对应值
        const handler = (e) => { eventHandler(e.detail) };
        eventBin[typeName].push({ handler, options: customOptions });
        // 绑定事件, 如果传入了 target, 则绑定在 target 上
        if (target) {
            target.addEventListener(typeName, handler, false);
        } else {
            eventDOM.addEventListener(typeName, handler, false);
        }
    },
    dispatchEvent: (typeName, data) => {
        // 为事件附带自定义数据 (必须放入 detail 这个属性中)
        const event = new CustomEvent(typeName, { 'detail': data });
        // 分发事件, 如果存在 target, 则发送到 target
        GlobalEvent.targetsOf(typeName).forEach(target => target.dispatchEvent(event));
    },
    // 移除对应事件的Handler
    removeEventHandler: (typeName, eventHandler) => {
        // 移除事件, 如果存在 target, 则移除 target 上的
        GlobalEvent.targetsOf(typeName).forEach(target => target.removeEventListener(typeName, eventHandler, false));
    },
    // 获取事件目标的属性
    targetsOf: function (typeName) {
        if (eventBin[typeName]) {
            return eventBin[typeName].map(typeData => {
                if (typeData.options.target) {
                    return typeData.options.target
                } else {
                    return eventDOM
                }
            });
        }
        return [eventDOM]
    },
    // 阻止事件默认行为
    preventDefault: function (event) {
        if (event.preventDefault) {
            event.preventDefault();
        } else {
            event.returnValue = false;
        }
    },
    // 阻止事件冒泡
    stopPropagation: function (event) {
        if (event.stopPropagation) {
            event.stopPropagation();
        } else {
            event.cancelBubble = true;
        }
    }
};

// 全局数据对象工具类
// 用来缓存数据, 防止重复获取
// type: string 对象名称
// data: object 数据内容
// id: 数据标签, 可不填, 默认等于type
window.globalData = {};
export const GlobalData = {
    // 初始化
    init: (type) => {
        if (!window.globalData[type]) {
            window.globalData[type] = {
                needUpdate: true,
                id: null,
                data: null
            }
        }
    },
    // 获取整个对象
    get: (type) => {
        return window.globalData[type];
    },
    // 获取需要更新的状态
    getNeedUpdate: (type) => {
        return window.globalData[type] ? window.globalData[type].needUpdate : true;
    },
    // 获取数据
    getData: (type) => {
        return window.globalData[type]? window.globalData[type].data : null;
    },
    // 获取Id
    getId: (type) => {
        return window.globalData[type]? window.globalData[type].id : null;
    },
    // 更新整个对象
    set: (type, data, id) => {
        window.globalData[type].needUpdate = false;
        window.globalData[type].id = id || type;
        window.globalData[type].data = data;
    },
    // 设置需要更新的状态
    setNeedUpdateState: (type, state) => {
        window.globalData[type].needUpdate = state;
    }
};

// 前后添加单引号
// sf = stringify
export const sf = (text) => {
    return `'${text}'`
};

// 禁止页面接受拖拽事件
export const preventDrop = () => {
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
export const nameOfPath = (path) => {
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
export const nameOfFile = (fullName) => {
    return fullName.replace(/\.\w+$/,"");
};
// 从文件名获取文件后缀
export const typeOfFile = (fullName) => {
    return /\.[^\.]+$/.exec(fullName)[0].replace(/\./,"").toLowerCase();
};

// 从字符串获取文件大小
export const sizeOfString = (string) => {
	return Buffer.byteLength(string, 'utf8');
};

// 16进制转10
export const hexToDec = (decNumber) => {
    return parseInt(decNumber, 16);
};
// 10进制转16
export const decToHex = (decNumber) => {
    return decNumber.toString(16).toUpperCase();
};

// 禁用掉 Chrome(Electron?) 内的 button 自动 focus 效果
export const disableChromeAutoFocus = () => {
    // const blurList = ["[object HTMLUListElement]", "[object HTMLButtonElement]"];
    document.addEventListener('click', () => {
        if(document.activeElement.toString() === "[object HTMLButtonElement]") {
            document.activeElement.blur();
        }
    });
};

// 获取系统
// darwin, win32
import os from 'os'
const currentPlatform = os.platform()
export const platform = () => currentPlatform
