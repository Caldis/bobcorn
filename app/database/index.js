const dev = process.env.NODE_ENV === 'development';

// fs
import fs from 'fs';
// SVG
import SVG from '../utils/svg';
// SQLite
import initSqlJs from 'sql.js';
// Config
import config from '../config';
// Utils
import { generateUUID, sf, nameOfPath, nameOfFile, typeOfFile, hexToDec, decToHex, sizeOfString} from '../utils/tools';

// 表结构数据
const projectAttributes = "projectAttributes";
const projectAttributesTimeRenewTrigger = "projectAttributesTimeRenewTrigger";
const groupData = "groupData";
const groupDataTimeRenewTrigger = "groupDataTimeRenewTrigger";
const iconData = "iconData";
const iconDataTimeRenewTrigger = "iconDataTimeRenewTrigger";

class Database {
    constructor() {
        // 内部引用
        this.dbInited = false; // 数据库初始化标记
        this.db = null; // 自己的数据库
        this.SQL = null; // sql.js module reference
        this.unusedIconCodeList = null; // 未使用的图标字码列表
        // NOTE: init() must be called and awaited before using the database
    }

    // 异步初始化 sql.js WASM 引擎
    init = async () => {
        if (!this.SQL) {
            this.SQL = await initSqlJs();
        }
        this.initDatabases();
        return this;
    };

    // 基本方法
    // 初始化数据库
    initDatabases = (data) => {
	    dev && console.log("initDatabases");
        if (!this.dbInited) {
            this.dbInited = true;
            this.db = new this.SQL.Database(data);
        }
    };
    // 构建数据对表达式
    // dataSet: 数据对, 会根据对应的key-value生成数据
    // 示例: { projectID: 8964, projectName: "'项目名称'" }
    // options-needName: 输出时候否需要带名字
    // options-needData: 输出时候否需要带数据
    // options-equal: 是否用等于来判断
    buildDataSTMT = (dataSet, options) => {
        // 设置默认选项
        let defaultOptions = {needName: true, needData: true, equal: true};
        options = Object.assign(defaultOptions, options);
        // 构建表达式
        let dataSTMT = "";
        let dataSetLastIndex = Object.keys(dataSet).length-1;
        if (!options.equal) {
            // 排除某值(不等于)
            // 输出: projectID <> 8964, projectName <> '项目名称'
            Object.keys(dataSet).forEach((colName, index) => {
                const colData = dataSet[colName];
                if (index !== dataSetLastIndex) {
                    dataSTMT += `${colName} <> ${colData}, `;
                } else {
                    dataSTMT += `${colName} <> ${colData}`;
                }
            });
        } else if (options.needName && options.needData) {
            // 带列名称
            // 输出: projectID = 8964, projectName = '项目名称'
            Object.keys(dataSet).forEach((colName, index) => {
                const colData = dataSet[colName];
                if (index !== dataSetLastIndex) {
                    dataSTMT += `${colName} = ${colData}, `;
                } else {
                    dataSTMT += `${colName} = ${colData}`;
                }
            });
        } else if (!options.needName && options.needData) {
            // 不带列名称, 仅列数据, 带括号
            // 输出: (8964, '项目名称')
            dataSTMT += "(";
            Object.keys(dataSet).forEach((colName, index) => {
                const colData = dataSet[colName];
                if (index !== dataSetLastIndex) {
                    dataSTMT += `${colData}, `;
                } else {
                    dataSTMT += `${colData})`;
                }
            });
        } else if (options.needName && !options.needData) {
            // 不带列数据, 仅列名称, 带括号
            // 输出: (projectID, projectName)
            dataSTMT += "(";
            Object.keys(dataSet).forEach((colName, index) => {
                if (index !== dataSetLastIndex) {
                    dataSTMT += `${colName}, `;
                } else {
                    dataSTMT += `${colName})`;
                }
            });
        }
        return dataSTMT;
    };
    // 添加数据到TABLE, 注意使用时要根据数据格式自行添加单引号
    // table: 表名
    // 示例: "projectAttributes"
    // dataSet: 数据对
    // 示例: { projectID: 8964, projectName: "'项目名称'" }
    addDataToTable = (tableName, dataSet, callback) => {
	    dev && console.log("addDataToTable");
	    dev && console.log(`INSERT INTO ${tableName} ${this.buildDataSTMT(dataSet, {needData: false})} VALUES ${this.buildDataSTMT(dataSet, {needName: false})}`);
        this.db.run(`INSERT INTO ${tableName} ${this.buildDataSTMT(dataSet, {needData: false})} VALUES ${this.buildDataSTMT(dataSet, {needName: false})}`);
        callback && callback();
    };
    // 更新TABLE某列数据, dataSet的数据也要注意添加引号, rowKeySet用于定位某行
    // tableName: 表名
    // dataSet: 数据对
    // targetRowDataSet: 目标行的数据对
    setDataOfTable = (tableName, targetDataSet, dataSet, callback) => {
	    dev && console.log("setDataOfTable");
	    dev && console.log(`UPDATE ${tableName} SET ${this.buildDataSTMT(dataSet)} WHERE ${this.buildDataSTMT(targetDataSet)}`);
        this.db.run(`UPDATE ${tableName} SET ${this.buildDataSTMT(dataSet)} WHERE ${this.buildDataSTMT(targetDataSet)}`);
        callback && callback();
    };
    // 获取TABLE某行数据
    // tableName: 表名
    // targetDataSet: 目标行的数据对
    // options-single: 是否只返回一行数据
    // options-where: 是否应用where关键字查询, 如果是则需要传入targetDataSet
    getDataOfTable = (tableName, targetDataSet, options) => {
	    dev && console.log("getDataOfTable");
        // 设置默认选项
        let defaultOptions = {single: false, where: false, equal: true};
        options = Object.assign(defaultOptions, options);
        let res = null;
        if (options.single) {
            if (options.where) {
	            dev && console.log(`SELECT * FROM ${tableName} WHERE ${this.buildDataSTMT(targetDataSet, {equal: options.equal})}`);
                const stmt = this.db.prepare(`SELECT * FROM ${tableName} WHERE ${this.buildDataSTMT(targetDataSet, {equal: options.equal})}`);
                stmt.step();
                res = stmt.getAsObject();
            } else {
                const stmt = this.db.prepare(`SELECT * FROM ${tableName}`);
                stmt.step();
                res = stmt.getAsObject();
            }
        } else {
            if (options.where) {
	            dev && console.log(`SELECT * FROM ${tableName} WHERE ${this.buildDataSTMT(targetDataSet, {equal: options.equal})}`);
                const rawData = this.db.exec(`SELECT * FROM ${tableName} WHERE ${this.buildDataSTMT(targetDataSet, {equal: options.equal})}`);
                if (rawData.length !== 0) {
                    const colNameList = rawData[0].columns;
                    res = rawData[0].values.map(row => {
                        const rowData = {};
                        row.forEach((colData, index) => {
                            rowData[colNameList[index]] = colData
                        });
                        return rowData;
                    });
                }
            } else {
	            dev && console.log(`SELECT * FROM ${tableName}`);
                const rawData = this.db.exec(`SELECT * FROM ${tableName}`);
                if (rawData.length !== 0) {
                    const colNameList = rawData[0].columns;
                    res = rawData[0].values.map(row => {
                        const rowData = {};
                        row.forEach((colData, index) => {
                            rowData[colNameList[index]] = colData
                        });
                        return rowData;
                    });
                }
            }
        }
        return res;
    };
    // 删除TABLE某行数据
    // tableName: 表名
    // targetDataSet: 目标行的数据对
    // options-all: 是否直接清空该表
    delDataOfTable = (tableName, targetDataSet, options, callback) => {
	    dev && console.log("delDataOfTable");
        // 设置默认选项
        let defaultOptions = {all: false};
        options = Object.assign(defaultOptions, options);
        if (options.all) {
            this.db.exec(`DELETE FROM ${tableName}`);
        } else {
            this.db.exec(`DELETE FROM ${tableName} WHERE ${this.buildDataSTMT(targetDataSet)}`);
        }
        callback && callback();
    };
    // 统计TABLE总行数
    getDataCountsOfTable = (tableName, targetDataSet) => {
	    dev && console.log("getDataCountsOfTable");
	    if (targetDataSet) {
		    dev && console.log(`SELECT COUNT(*) FROM ${tableName} WHERE ${this.buildDataSTMT(targetDataSet)}`);
		    const stmt = this.db.prepare(`SELECT COUNT(*) FROM ${tableName} WHERE ${this.buildDataSTMT(targetDataSet)}`);
		    stmt.step();
		    return stmt.getAsObject()["COUNT(*)"];
	    } else {
		    dev && console.log(`SELECT COUNT(*) FROM ${tableName}`);
		    const stmt = this.db.prepare(`SELECT COUNT(*) FROM ${tableName}`);
		    stmt.step();
		    return stmt.getAsObject()["COUNT(*)"];
	    }
    };
    // 删库跑路~
    destroyDatabase = () => {
	    dev && console.log("destroyDatabase");
        this.dbInited = false;
        this.db = null;
    };


    // 项目相关
    // 初始化新项目
    initNewProject = (projectName) => {
	    dev && console.log("initNewProject");
        // 创建配置表, 并配置触发器自动更新时间戳, 再初始化数据
        this.db.run(`CREATE TABLE ${projectAttributes} (id varchar(255), projectName varchar(255), createTime datetime DEFAULT CURRENT_TIMESTAMP, updateTime datetime DEFAULT CURRENT_TIMESTAMP)`);
        this.db.run(`CREATE TRIGGER ${projectAttributesTimeRenewTrigger} AFTER UPDATE ON ${projectAttributes} FOR EACH ROW BEGIN UPDATE ${projectAttributes} SET updateTime = CURRENT_TIMESTAMP WHERE id = old.id; END`);
        this.db.run(`INSERT INTO ${projectAttributes} (id, projectName) VALUES ('projectAttributes', ${projectName ? sf(projectName) : sf("iconfont")})`); // 默认Prefix为iconfont
        // 创建分组数据表, 并配置触发器自动更新时间戳, 再初始化数据
        this.db.run(`CREATE TABLE ${groupData} (id varchar(255), groupName varchar(255), groupOrder int(255), groupColor varchar(255), createTime datetime DEFAULT CURRENT_TIMESTAMP, updateTime datetime DEFAULT CURRENT_TIMESTAMP)`);
        this.db.run(`CREATE TRIGGER ${groupDataTimeRenewTrigger} AFTER UPDATE ON ${groupData} FOR EACH ROW BEGIN UPDATE ${groupData} SET updateTime = CURRENT_TIMESTAMP WHERE id = old.id; END`);
        // 创建图标数据表, 并配置触发器自动更新时间戳
        this.db.run(`CREATE TABLE ${iconData} (id varchar(255), iconCode varchar(255), iconName varchar(255), iconGroup varchar(255), iconSize int(255), iconType varchar(255), iconContent TEXT, createTime datetime DEFAULT CURRENT_TIMESTAMP, updateTime datetime DEFAULT CURRENT_TIMESTAMP)`);
        this.db.run(`CREATE TRIGGER ${iconDataTimeRenewTrigger} AFTER UPDATE ON ${iconData} FOR EACH ROW BEGIN UPDATE ${iconData} SET updateTime = CURRENT_TIMESTAMP WHERE id = old.id; END`);
    };
    // 从文件初始化新项目
    initNewProjectFromData = (data) => {
	    dev && console.log("initNewProjectFromFile");
        this.destroyDatabase();
        this.initDatabases(data);
    };
    // 重置项目
    resetProject = (projectName) => {
	    dev && console.log("resetProject");
        this.destroyDatabase();
        this.initDatabases();
        this.initNewProject(projectName);
    };
    // 导出项目
    exportProject = (callback) => {
        callback && callback(this.db.export());
        // 拿到数据后:
        // const buffer = new Buffer(data);
        // fs.writeFileSync("filename.sqlite", buffer);
    };

    // 项目配置项相关
    setProjectAttributes = (dataSet, callback) => {
        const targetDataSet = { id: sf("projectAttributes") };
        this.setDataOfTable(projectAttributes, targetDataSet, dataSet, callback);
    };
    getProjectAttributes = (rowName) => {
        const targetDataSet = { id: sf("projectAttributes") };
        return this.getDataOfTable(projectAttributes, targetDataSet, {single: true, where: true})[rowName];
    };
    // ProjectName 即图标字体 Prefix
    setProjectName = (projectName, callback) => {
        const dataSet = { projectName: sf(projectName) };
        this.setProjectAttributes(dataSet, callback);
    };
    getProjectName = () => {
        return this.getProjectAttributes("projectName");
    };

    // 分组相关
    addGroupData = (dataSet, callback) => {
	    dev && console.log("addGroupData");
        this.addDataToTable(groupData, dataSet, callback);
    };
    setGroupData = (id, dataSet, callback) => {
	    dev && console.log("setGroupData");
        const targetDataSet = { id: sf(id) };
        this.setDataOfTable(groupData, targetDataSet, dataSet, callback);
    };
    getGroupData = (id) => {
	    dev && console.log("getGroupData");
        const targetDataSet = { id: sf(id) };
        return this.getDataOfTable(groupData, targetDataSet, {single: true, where: true});
    };
    addGroup = (name, callback) => {
	    dev && console.log("addGroup");
        const id = generateUUID();
        const groupOrder = this.getDataCountsOfTable(groupData);
        this.addGroupData({
            id: sf(id),
            groupName: sf(name),
            groupOrder
        });
        callback && callback({
            id: id,
            groupName: name,
            groupOrder: groupOrder
        });
    };
    delGroup = (id, callback) => {
	    dev && console.log("delGroup");
        // 先删除分组下的图标
        const iconsOnGroup = this.getIconListFromGroup(id);
        iconsOnGroup.forEach(icon => {
            this.delIcon(icon.id);
        });
        // 然后删除分组
        const targetDataSet = { id: sf(id) };
        this.delDataOfTable(groupData, targetDataSet, {all: false}, callback);
    };
    setGroupList = (id, callback) => {

    };
    getGroupList = () => {
	    dev && console.log("getGroupList");
        return this.getDataOfTable(groupData) || [];
    };
    setGroupName = (id, groupName, callback) => {
	    dev && console.log("setGroupName");
        const dataSet = { groupName: sf(groupName) };
        this.setGroupData(id, dataSet, callback);
    };
    getGroupName = (id) => {
	    dev && console.log("getGroupName");
        if (id==="resource-all") {
            return "全部";
        } else if (id==="resource-uncategorized") {
            return "未分类";
        } else if (id==="resource-deleted") {
            return "已删除";
        } else {
            return this.getGroupData(id).groupName;
        }
    };
    setGroupColor = () => {

    };
    getGroupColor = () => {

    };

    // 图标相关
    setIconData = (id, dataSet, callback) => {
	    dev && console.log("setIconData");
        const targetDataSet = { id: sf(id) };
        this.setDataOfTable(iconData, targetDataSet, dataSet, callback);
    };
    getIconData = (id) => {
	    dev && console.log("getIconData");
        const targetDataSet = { id: sf(id) };
        return this.getDataOfTable(iconData, targetDataSet, {single: true, where: true});
    };
    checkIconCodeDuplicate = () => {
        const stmt = this.db.prepare(`SELECT iconCode,COUNT(*) FROM ${iconData} GROUP BY iconCode HAVING COUNT(*) > 1`);
        stmt.step();
        res = stmt.getAsObject();
    };
    formatIconDataFromFilePath = (path, targetGroup) => {
        const svg = new SVG(fs.readFileSync(path).toString());
        return {
            id: sf(generateUUID()),
            iconCode: sf(this.getNewIconCode()),
            iconName: sf(nameOfFile(nameOfPath(path))),
            iconGroup: sf(targetGroup),
            iconSize: fs.statSync(path).size,
            iconType: sf(typeOfFile(nameOfPath(path))),
            iconContent: sf(svg.formatSVG().getOuterHTML())
        }
    };
	formatIconDataFromData = (obj, targetGroup) => {
		const svg = new SVG(obj.iconContent);
		return {
			id: sf(generateUUID()),
			iconCode: sf(this.getNewIconCode()),
			iconName: sf(obj.iconName),
			iconGroup: sf(targetGroup),
			iconSize: sizeOfString(obj.iconContent),
			iconType: sf(obj.iconType),
			iconContent: sf(svg.formatSVG().getOuterHTML())
		}
	};
    formatIconDataFromCpData = (obj, targetGroup) => {
        const svg = new SVG(obj.glyph);
        return {
            id: sf(generateUUID()),
            iconCode: sf(obj.unicodeNum.toUpperCase()),
            iconName: sf(obj.name),
            iconGroup: sf(targetGroup),
            iconSize: obj.size*512,
            iconType: sf("svg"),
            iconContent: sf(svg.formatSVG().getOuterHTML())
        }
    };
    // 获取一个可用的图标字码
    getNewIconCode = (type, test) => {
	    dev && console.log("getNewIconCode");
        // 先获取现有的图标字码列表
        const rawData = this.db.exec(`SELECT iconCode from ${iconData}`);
        // 根据是已经有图标判断
        if (rawData.length) {
            // 如果有, 则遍历已有的, 然后从完整列表中剔除掉已有的, 剩下的就是未使用的列表, 再取其第一个
            const usedIconCodeList = rawData[0].values.map(code => code[0]);
            const unusedIconCodeList = config.publicRangeUnicodeDecList.concat();
	        usedIconCodeList.forEach(code => unusedIconCodeList.splice(unusedIconCodeList.indexOf(hexToDec(code)), 1));
	        // 返回第一个可用的图标字码 (第一个为可用中最小的)
            const newIconCode = type==="dec" ? unusedIconCodeList[0] : decToHex(unusedIconCodeList[0]);
            // 如果只是获取图标字码用于测试, 则不从可用表中移除该图标字码
            !test && unusedIconCodeList.splice(0, 1);
            return newIconCode;
        } else {
            // 如果没有已存在的图标, 直接返回最小的
            return type==="dec" ? config.publicRangeUnicodeDecMin : config.publicRangeUnicodeHexMin;
        }
    };
    // 测试图标字码是否在可用字码段内
    iconCodeInRange = (iconCode) => {
	    dev && console.log("iconCodeInRange");
        return iconCode.length===4 && hexToDec(iconCode)>=config.publicRangeUnicodeDecMin && hexToDec(iconCode)<=config.publicRangeUnicodeDecMax;
    };
    // 测试图标字码是否可用
    iconCodeCanUse = (iconCode) => {
	    dev && console.log("iconCodeCanUse");
        const targetDataSet = { iconCode: sf(iconCode).toUpperCase() };
        return !this.getDataOfTable(iconData, targetDataSet, {where: true}) && this.iconCodeInRange(iconCode);
    };
	addIcons = (iconFilesData, targetGroup, callback) => {
		dev && console.log("addIcons");
		iconFilesData.forEach(data => {
			// 如果加入到 all 分组, 则转换为加入 未分类 分组
			const dataSet = this.formatIconDataFromFilePath(data.path, targetGroup==="resource-all" ? "resource-uncategorized" : targetGroup);
			this.addDataToTable(iconData, dataSet);
		});
		callback && callback();
	};
	addIconsFromData = (iconFilesData, targetGroup, callback) => {
		dev && console.log("addIcons");
		iconFilesData.forEach(data => {
			// 如果加入到 all 分组, 则转换为加入 未分类 分组
			const dataSet = this.formatIconDataFromData(data, targetGroup==="resource-all" ? "resource-uncategorized" : targetGroup);
			this.addDataToTable(iconData, dataSet);
		});
		callback && callback();
	};
    addIconsFromCpData = (iconFilesData, targetGroup, callback) => {
	    dev && console.log("addIcons");
        iconFilesData.forEach(data => {
            // 如果是原始 cp 的 未分类 分组, 则转换为加入 未分类 分组
            const dataSet = this.formatIconDataFromCpData(data, targetGroup==="未分类" ? "resource-uncategorized" : targetGroup);
            this.addDataToTable(iconData, dataSet);
        });
        callback && callback();
    };
    delIcon = (id, callback) => {
	    dev && console.log("delIcon");
        const targetDataSet = { id: sf(id) };
        this.delDataOfTable(iconData, targetDataSet, {all: false}, callback);
    };
    // 获取所有图标数
    getIconCount = () => {
	    dev && console.log("getIconCount");
        return this.getDataCountsOfTable(iconData);
    };
	// 从特定组中获取图标数
    getIconCountFromGroup = (targetGroup) => {
	    dev && console.log("getIconCountFromGroup");
	    const targetDataSet = {iconGroup: sf(targetGroup)};
	    return this.getDataCountsOfTable(iconData, targetDataSet);
    };
    // 取所有图标
    getIconList = () => {
	    dev && console.log("getIconList");
        const targetDataSet = { iconGroup: sf("resource-deleted") };
        return this.getDataOfTable(iconData, targetDataSet, {where: true, equal: false}) || [];
    };
    // 从特定组中取图标
    getIconListFromGroup = (targetGroup) => {
	    dev && console.log("getIconListFromGroup");
        if (targetGroup.constructor === String) {
            // 从一个目标组中取
            if (targetGroup === "resource-all") {
                // 如果取 resource-all 分组, 则直接取all
                return this.getDataOfTable(iconData) || [];
            } else {
                const targetDataSet = {iconGroup: sf(targetGroup)};
                return this.getDataOfTable(iconData, targetDataSet, {where: true}) || [];
            }
        } else if (targetGroup.constructor === Array) {
            // 多个组
            let iconList = [];
            targetGroup.forEach(id => {
                const targetDataSet = {iconGroup: sf(id)};
                const iconListOnGroup = this.getDataOfTable(iconData, targetDataSet, {where: true}) || [];
                iconList = iconList.concat(iconListOnGroup);
            });
	        dev && console.log(iconList);
            return iconList;
        }
    };
    getIconName = (id) => {

    };
    setIconName = (id, iconName, callback) => {
	    dev && console.log("setIconName");
        const dataSet = { iconName: sf(iconName) };
        this.setIconData(id, dataSet, callback);
    };
    getIconContent = () => {

    };
    setIconContent = () => {
    };
    setIconCode = (id, newIconCode, callback) => {
	    dev && console.log("setIconCode");
        const dataSet = { iconCode: sf(newIconCode).toUpperCase() };
        this.setIconData(id, dataSet, callback);
    };
    moveIconGroup = (id, targetGroup, callback) => {
	    dev && console.log("moveIconGroup");
        const targetDataSet = { id: sf(id) };
        // 如果移动到all分组, 则转换为加入未分类分组
        const dataSet = { iconGroup: sf(targetGroup==="resource-all" ? "resource-uncategorized" : targetGroup) };
        this.setDataOfTable(iconData, targetDataSet, dataSet, callback);
    };
    duplicateIconGroup = (id, targetGroup, callback) => {
	    dev && console.log("duplicateIconGroup");
        const sourceIconData = this.getIconData(id);
        // 重新生成UUID与字码
        const dataSet = {
            id: sf(generateUUID()),
            iconCode: sf(this.getNewIconCode()),
            iconName: sf(sourceIconData.iconName),
            // 如果复制到all分组, 则转换为加入未分类分组
            iconGroup: sf(targetGroup==="resource-all" ? "resource-uncategorized" : targetGroup),
            iconSize: sourceIconData.iconSize,
            iconType: sf(sourceIconData.iconType),
            iconContent: sf(sourceIconData.iconContent)
        };
        this.addDataToTable(iconData, dataSet, callback);
    };
    renewIconData = (id, newIconFileData, callback) => {
	    dev && console.log("renewIconData");
        // 仅更新size,type,content
        const dataSet = {
            id: sf(newIconFileData.id),
            iconCode: sf(newIconFileData.iconCode),
            iconName: sf(newIconFileData.iconName),
            iconGroup: sf(newIconFileData.iconGroup),
            iconSize: fs.statSync(newIconFileData.path).size,
            iconType: sf(typeOfFile(nameOfPath(newIconFileData.path))),
            iconContent: sf(fs.readFileSync(newIconFileData.path).toString())
        };
        this.setIconData(id, dataSet, callback);
    };


    // 测试用
    test = () => {
        // // Run a query without reading the results
        // db.run("CREATE TABLE test (col1, col2);");
        // // Insert two rows: (1,111) and (2,222)
        // db.run("INSERT INTO test VALUES (?,?), (?,?)", [1,111,2,222]);
        // // Prepare a statement
        // var stmt = db.prepare("SELECT * FROM test WHERE col1 BETWEEN $start AND $end");
        // console.log(stmt.getAsObject({$start:1, $end:1})); // {col1:1, col2:111}
        console.log(this.db.run("SELECT * FROM projectAttributes"));
    };
}


const db = new Database();
const dbReady = db.init().then(() => {
    db.initNewProject();
    // DEBUG
    window.db = db;
    return db;
});
export default db;
export { Database, dbReady };