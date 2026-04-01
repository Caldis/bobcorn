const dev: boolean = import.meta.env?.DEV ?? false;

// SVG
import SVG from '../utils/svg';
import { extractSvgColors, replaceSvgColor } from '../utils/svg/colors';
// SQLite (use ASM build - pure JS, no WASM file needed)
import initSqlJs from 'sql.js/dist/sql-asm.js';
// Config
import config from '../config';
// Utils
import {
  generateUUID,
  sf,
  nameOfPath,
  nameOfFile,
  typeOfFile,
  hexToDec,
  decToHex,
  sizeOfString,
} from '../utils/tools';

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

/** A key-value record used for SQL column data (values are SQL literals) */
interface DataSet {
  [key: string]: string | number;
}

/** Options for buildDataSTMT */
interface BuildDataSTMTOptions {
  needName?: boolean;
  needData?: boolean;
  equal?: boolean;
}

/** Options for getDataOfTable */
interface GetDataOptions {
  single?: boolean;
  where?: boolean;
  equal?: boolean;
}

/** Options for delDataOfTable */
interface DelDataOptions {
  all?: boolean;
}

/** Icon data as stored in the database */
export interface IconData {
  id: string;
  iconCode: string;
  iconName: string;
  iconGroup: string;
  iconSize: number;
  iconType: string;
  iconContent: string;
  createTime?: string;
  updateTime?: string;
}

/** Group data as stored in the database */
export interface GroupData {
  id: string;
  groupName: string;
  groupOrder: number;
  groupColor?: string;
  createTime?: string;
  updateTime?: string;
}

/** Project attributes as stored in the database */
export interface ProjectAttributes {
  id: string;
  projectName: string;
  createTime?: string;
  updateTime?: string;
}

/** Icon file data from the file system (used by addIcons) */
interface IconFileData {
  path: string;
}

/** Icon data object for addIconsFromData */
interface IconImportData {
  iconName: string;
  iconContent: string;
  iconType: string;
}

/** Legacy icon data for addIconsFromCpData */
interface CpIconData {
  glyph: string;
  unicodeNum: string;
  name: string;
  size: number;
}

/** Renewal icon file data */
interface RenewIconFileData {
  id: string;
  iconCode: string;
  iconName: string;
  iconGroup: string;
  path: string;
}

/** sql.js types (no @types available for sql.js/dist/sql-asm.js) */
interface SqlJsStatic {
  Database: new (data?: ArrayLike<number>) => SqlJsDatabase;
}

interface SqlJsDatabase {
  run(sql: string, params?: any[]): SqlJsDatabase;
  exec(sql: string, params?: any[]): SqlJsQueryResult[];
  prepare(sql: string): SqlJsStatement;
  export(): Uint8Array;
}

interface SqlJsQueryResult {
  columns: string[];
  values: any[][];
}

interface SqlJsStatement {
  step(): boolean;
  getAsObject(params?: Record<string, any>): Record<string, any>;
}

// 表结构数据
const projectAttributes = 'projectAttributes';
const projectAttributesTimeRenewTrigger = 'projectAttributesTimeRenewTrigger';
const groupData = 'groupData';
const groupDataTimeRenewTrigger = 'groupDataTimeRenewTrigger';
const iconData = 'iconData';
const iconDataTimeRenewTrigger = 'iconDataTimeRenewTrigger';

class Database {
  dbInited: boolean;
  db: SqlJsDatabase | null;
  SQL: SqlJsStatic | null;
  unusedIconCodeList: number[] | null;

  // Mutation tracking — single callback for dirty state
  private onMutationCallback: (() => void) | null = null;
  registerOnMutation = (cb: () => void): void => {
    this.onMutationCallback = cb;
  };
  private notifyMutation = (): void => {
    this.onMutationCallback?.();
  };

  constructor() {
    // 内部引用
    this.dbInited = false; // 数据库初始化标记
    this.db = null; // 自己的数据库
    this.SQL = null; // sql.js module reference
    this.unusedIconCodeList = null; // 未使用的图标字码列表
    // NOTE: init() must be called and awaited before using the database
  }

  // 异步初始化 sql.js WASM 引擎
  init = async (): Promise<this> => {
    if (!this.SQL) {
      this.SQL = await initSqlJs();
    }
    this.initDatabases();
    return this;
  };

  // 基本方法
  // 初始化数据库
  initDatabases = (data?: ArrayLike<number>): void => {
    dev && console.log('initDatabases');
    if (!this.dbInited) {
      this.dbInited = true;
      const p = (window as any).__BOBCORN_PERF__;
      p?.mark('db.sqljs_deserialize');
      this.db = new this.SQL!.Database(data);
      p?.measure('db.sqljs_deserialize');
      // Migration: add iconContentOriginal column for existing projects
      if (data) {
        try {
          p?.mark('db.migration_check');
          const cols = this.db!.exec(`PRAGMA table_info(${iconData})`);
          const hasCol =
            cols.length > 0 && cols[0].values.some((row: any) => row[1] === 'iconContentOriginal');
          if (!hasCol) {
            p?.mark('db.migration_alter');
            this.db!.run(`ALTER TABLE ${iconData} ADD COLUMN iconContentOriginal TEXT`);
            // No bulk backfill — iconContentOriginal stays NULL for legacy rows.
            // Populated lazily by ensureOriginalContent() on first content mutation.
            p?.measure('db.migration_alter');
            dev && console.log('Migration: added iconContentOriginal column (lazy backfill)');
          }
          p?.measure('db.migration_check');
        } catch (e) {
          dev && console.error('Migration error:', e);
        }
      }
    }
  };
  // 构建数据对表达式
  // dataSet: 数据对, 会根据对应的key-value生成数据
  // 示例: { projectID: 8964, projectName: "'项目名称'" }
  // options-needName: 输出时候否需要带名字
  // options-needData: 输出时候否需要带数据
  // options-equal: 是否用等于来判断
  buildDataSTMT = (dataSet: DataSet, options?: BuildDataSTMTOptions): string => {
    // 设置默认选项
    const defaultOptions: Required<BuildDataSTMTOptions> = {
      needName: true,
      needData: true,
      equal: true,
    };
    const opts = Object.assign(defaultOptions, options);
    // 构建表达式
    let dataSTMT = '';
    const dataSetLastIndex = Object.keys(dataSet).length - 1;
    if (!opts.equal) {
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
    } else if (opts.needName && opts.needData) {
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
    } else if (!opts.needName && opts.needData) {
      // 不带列名称, 仅列数据, 带括号
      // 输出: (8964, '项目名称')
      dataSTMT += '(';
      Object.keys(dataSet).forEach((colName, index) => {
        const colData = dataSet[colName];
        if (index !== dataSetLastIndex) {
          dataSTMT += `${colData}, `;
        } else {
          dataSTMT += `${colData})`;
        }
      });
    } else if (opts.needName && !opts.needData) {
      // 不带列数据, 仅列名称, 带括号
      // 输出: (projectID, projectName)
      dataSTMT += '(';
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
  addDataToTable = (tableName: string, dataSet: DataSet, callback?: () => void): void => {
    dev && console.log('addDataToTable');
    dev &&
      console.log(
        `INSERT INTO ${tableName} ${this.buildDataSTMT(dataSet, { needData: false })} VALUES ${this.buildDataSTMT(dataSet, { needName: false })}`
      );
    this.db!.run(
      `INSERT INTO ${tableName} ${this.buildDataSTMT(dataSet, { needData: false })} VALUES ${this.buildDataSTMT(dataSet, { needName: false })}`
    );
    callback && callback();
  };
  // 更新TABLE某列数据, dataSet的数据也要注意添加引号, rowKeySet用于定位某行
  // tableName: 表名
  // dataSet: 数据对
  // targetRowDataSet: 目标行的数据对
  setDataOfTable = (
    tableName: string,
    targetDataSet: DataSet,
    dataSet: DataSet,
    callback?: () => void
  ): void => {
    dev && console.log('setDataOfTable');
    dev &&
      console.log(
        `UPDATE ${tableName} SET ${this.buildDataSTMT(dataSet)} WHERE ${this.buildDataSTMT(targetDataSet)}`
      );
    this.db!.run(
      `UPDATE ${tableName} SET ${this.buildDataSTMT(dataSet)} WHERE ${this.buildDataSTMT(targetDataSet)}`
    );
    callback && callback();
  };
  // 获取TABLE某行数据
  // tableName: 表名
  // targetDataSet: 目标行的数据对
  // options-single: 是否只返回一行数据
  // options-where: 是否应用where关键字查询, 如果是则需要传入targetDataSet
  getDataOfTable = (
    tableName: string,
    targetDataSet?: DataSet,
    options?: GetDataOptions
  ): Record<string, any> | Record<string, any>[] | null => {
    dev && console.log('getDataOfTable');
    // 设置默认选项
    const defaultOptions: Required<GetDataOptions> = { single: false, where: false, equal: true };
    const opts = Object.assign(defaultOptions, options);
    let res: Record<string, any> | Record<string, any>[] | null = null;
    if (opts.single) {
      if (opts.where) {
        dev &&
          console.log(
            `SELECT * FROM ${tableName} WHERE ${this.buildDataSTMT(targetDataSet!, { equal: opts.equal })}`
          );
        const stmt = this.db!.prepare(
          `SELECT * FROM ${tableName} WHERE ${this.buildDataSTMT(targetDataSet!, { equal: opts.equal })}`
        );
        stmt.step();
        res = stmt.getAsObject();
      } else {
        const stmt = this.db!.prepare(`SELECT * FROM ${tableName}`);
        stmt.step();
        res = stmt.getAsObject();
      }
    } else {
      if (opts.where) {
        dev &&
          console.log(
            `SELECT * FROM ${tableName} WHERE ${this.buildDataSTMT(targetDataSet!, { equal: opts.equal })}`
          );
        const rawData = this.db!.exec(
          `SELECT * FROM ${tableName} WHERE ${this.buildDataSTMT(targetDataSet!, { equal: opts.equal })}`
        );
        if (rawData.length !== 0) {
          const colNameList = rawData[0].columns;
          res = rawData[0].values.map((row) => {
            const rowData: Record<string, any> = {};
            row.forEach((colData: any, index: number) => {
              rowData[colNameList[index]] = colData;
            });
            return rowData;
          });
        }
      } else {
        dev && console.log(`SELECT * FROM ${tableName}`);
        const rawData = this.db!.exec(`SELECT * FROM ${tableName}`);
        if (rawData.length !== 0) {
          const colNameList = rawData[0].columns;
          res = rawData[0].values.map((row) => {
            const rowData: Record<string, any> = {};
            row.forEach((colData: any, index: number) => {
              rowData[colNameList[index]] = colData;
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
  delDataOfTable = (
    tableName: string,
    targetDataSet: DataSet,
    options?: DelDataOptions,
    callback?: () => void
  ): void => {
    dev && console.log('delDataOfTable');
    // 设置默认选项
    const defaultOptions: Required<DelDataOptions> = { all: false };
    const opts = Object.assign(defaultOptions, options);
    if (opts.all) {
      this.db!.exec(`DELETE FROM ${tableName}`);
    } else {
      this.db!.exec(`DELETE FROM ${tableName} WHERE ${this.buildDataSTMT(targetDataSet)}`);
    }
    callback && callback();
  };
  // 统计TABLE总行数
  getDataCountsOfTable = (tableName: string, targetDataSet?: DataSet): number => {
    dev && console.log('getDataCountsOfTable');
    if (targetDataSet) {
      dev &&
        console.log(`SELECT COUNT(*) FROM ${tableName} WHERE ${this.buildDataSTMT(targetDataSet)}`);
      const stmt = this.db!.prepare(
        `SELECT COUNT(*) FROM ${tableName} WHERE ${this.buildDataSTMT(targetDataSet)}`
      );
      stmt.step();
      return stmt.getAsObject()['COUNT(*)'] as number;
    } else {
      dev && console.log(`SELECT COUNT(*) FROM ${tableName}`);
      const stmt = this.db!.prepare(`SELECT COUNT(*) FROM ${tableName}`);
      stmt.step();
      return stmt.getAsObject()['COUNT(*)'] as number;
    }
  };
  // 删库跑路~
  destroyDatabase = (): void => {
    dev && console.log('destroyDatabase');
    this.dbInited = false;
    this.db = null;
  };

  // 项目相关
  // 初始化新项目
  initNewProject = (projectName?: string): void => {
    dev && console.log('initNewProject');
    // 创建配置表, 并配置触发器自动更新时间戳, 再初始化数据
    this.db!.run(
      `CREATE TABLE ${projectAttributes} (id varchar(255), projectName varchar(255), createTime datetime DEFAULT CURRENT_TIMESTAMP, updateTime datetime DEFAULT CURRENT_TIMESTAMP)`
    );
    this.db!.run(
      `CREATE TRIGGER ${projectAttributesTimeRenewTrigger} AFTER UPDATE ON ${projectAttributes} FOR EACH ROW BEGIN UPDATE ${projectAttributes} SET updateTime = CURRENT_TIMESTAMP WHERE id = old.id; END`
    );
    this.db!.run(
      `INSERT INTO ${projectAttributes} (id, projectName) VALUES ('projectAttributes', ${projectName ? sf(projectName) : sf('iconfont')})`
    ); // 默认Prefix为iconfont
    // 创建分组数据表, 并配置触发器自动更新时间戳, 再初始化数据
    this.db!.run(
      `CREATE TABLE ${groupData} (id varchar(255), groupName varchar(255), groupOrder int(255), groupColor varchar(255), createTime datetime DEFAULT CURRENT_TIMESTAMP, updateTime datetime DEFAULT CURRENT_TIMESTAMP)`
    );
    this.db!.run(
      `CREATE TRIGGER ${groupDataTimeRenewTrigger} AFTER UPDATE ON ${groupData} FOR EACH ROW BEGIN UPDATE ${groupData} SET updateTime = CURRENT_TIMESTAMP WHERE id = old.id; END`
    );
    // 创建图标数据表, 并配置触发器自动更新时间戳
    this.db!.run(
      `CREATE TABLE ${iconData} (id varchar(255), iconCode varchar(255), iconName varchar(255), iconGroup varchar(255), iconSize int(255), iconType varchar(255), iconContent TEXT, iconContentOriginal TEXT, createTime datetime DEFAULT CURRENT_TIMESTAMP, updateTime datetime DEFAULT CURRENT_TIMESTAMP)`
    );
    this.db!.run(
      `CREATE TRIGGER ${iconDataTimeRenewTrigger} AFTER UPDATE ON ${iconData} FOR EACH ROW BEGIN UPDATE ${iconData} SET updateTime = CURRENT_TIMESTAMP WHERE id = old.id; END`
    );
  };
  // 从文件初始化新项目
  initNewProjectFromData = (data: ArrayLike<number>): void => {
    dev && console.log('initNewProjectFromFile');
    this.destroyDatabase();
    this.initDatabases(data);
  };
  // 重置项目
  resetProject = (projectName?: string): void => {
    dev && console.log('resetProject');
    this.destroyDatabase();
    this.initDatabases();
    this.initNewProject(projectName);
    this.notifyMutation();
  };
  // 导出项目
  exportProject = (callback?: (data: Uint8Array) => void): void => {
    callback && callback(this.db!.export());
    // 拿到数据后:
    // const buffer = new Buffer(data);
    // fs.writeFileSync("filename.sqlite", buffer);
  };

  // 项目配置项相关
  setProjectAttributes = (dataSet: DataSet, callback?: () => void): void => {
    const targetDataSet: DataSet = { id: sf('projectAttributes') };
    this.setDataOfTable(projectAttributes, targetDataSet, dataSet);
    this.notifyMutation();
    callback && callback();
  };
  getProjectAttributes = (rowName: string): any => {
    const targetDataSet: DataSet = { id: sf('projectAttributes') };
    return (
      this.getDataOfTable(projectAttributes, targetDataSet, {
        single: true,
        where: true,
      }) as Record<string, any>
    )[rowName];
  };
  // ProjectName 即图标字体 Prefix
  setProjectName = (projectName: string, callback?: () => void): void => {
    const dataSet: DataSet = { projectName: sf(projectName) };
    this.setProjectAttributes(dataSet, callback);
  };
  getProjectName = (): string => {
    return this.getProjectAttributes('projectName');
  };

  // 分组相关
  addGroupData = (dataSet: DataSet, callback?: () => void): void => {
    dev && console.log('addGroupData');
    this.addDataToTable(groupData, dataSet);
    this.notifyMutation();
    callback && callback();
  };
  setGroupData = (id: string, dataSet: DataSet, callback?: () => void): void => {
    dev && console.log('setGroupData');
    const targetDataSet: DataSet = { id: sf(id) };
    this.setDataOfTable(groupData, targetDataSet, dataSet);
    this.notifyMutation();
    callback && callback();
  };
  getGroupData = (id: string): Record<string, any> => {
    dev && console.log('getGroupData');
    const targetDataSet: DataSet = { id: sf(id) };
    return this.getDataOfTable(groupData, targetDataSet, { single: true, where: true }) as Record<
      string,
      any
    >;
  };
  addGroup = (
    name: string,
    callback?: (group: { id: string; groupName: string; groupOrder: number }) => void
  ): void => {
    dev && console.log('addGroup');
    const id = generateUUID();
    const groupOrder = this.getDataCountsOfTable(groupData);
    this.addGroupData({
      id: sf(id),
      groupName: sf(name),
      groupOrder,
    });
    this.notifyMutation();
    callback &&
      callback({
        id: id,
        groupName: name,
        groupOrder: groupOrder,
      });
  };
  delGroup = (id: string, callback?: () => void): void => {
    dev && console.log('delGroup');
    // 将分组下的图标移到未分组（而非删除）
    this.db!.exec(
      `UPDATE ${iconData} SET iconGroup = 'resource-uncategorized' WHERE iconGroup = ${sf(id)}`
    );
    // 然后删除分组
    const targetDataSet: DataSet = { id: sf(id) };
    this.delDataOfTable(groupData, targetDataSet, { all: false }, () => {
      this.notifyMutation();
      callback && callback();
    });
  };
  getGroupList = (): Record<string, any>[] => {
    dev && console.log('getGroupList');
    const p = (window as any).__BOBCORN_PERF__;
    p?.mark('db.getGroupList');
    const rawData = this.db!.exec(`SELECT * FROM ${groupData} ORDER BY groupOrder ASC`);
    if (rawData.length === 0) {
      p?.measure('db.getGroupList');
      return [];
    }
    const colNameList = rawData[0].columns;
    const result = rawData[0].values.map((row) => {
      const rowData: Record<string, any> = {};
      row.forEach((colData: any, index: number) => {
        rowData[colNameList[index]] = colData;
      });
      return rowData;
    });
    p?.measure('db.getGroupList');
    return result;
  };
  // 批量更新分组排序
  reorderGroups = (orderedIds: string[], callback?: () => void): void => {
    dev && console.log('reorderGroups');
    orderedIds.forEach((id, index) => {
      this.db!.run(`UPDATE ${groupData} SET groupOrder = ${index} WHERE id = '${id}'`);
    });
    this.notifyMutation();
    callback && callback();
  };
  setGroupName = (id: string, groupName: string, callback?: () => void): void => {
    dev && console.log('setGroupName');
    const dataSet: DataSet = { groupName: sf(groupName) };
    this.setGroupData(id, dataSet, callback);
  };
  getGroupName = (id: string): string => {
    dev && console.log('getGroupName');
    if (id === 'resource-all') {
      return '全部';
    } else if (id === 'resource-uncategorized') {
      return '未分类';
    } else if (id === 'resource-deleted') {
      return '已删除';
    } else {
      return this.getGroupData(id).groupName;
    }
  };
  // 图标相关
  setIconData = (id: string, dataSet: DataSet, callback?: () => void): void => {
    dev && console.log('setIconData');
    const targetDataSet: DataSet = { id: sf(id) };
    this.setDataOfTable(iconData, targetDataSet, dataSet);
    this.notifyMutation();
    callback && callback();
  };
  getIconData = (id: string): Record<string, any> => {
    dev && console.log('getIconData');
    const targetDataSet: DataSet = { id: sf(id) };
    return this.getDataOfTable(iconData, targetDataSet, { single: true, where: true }) as Record<
      string,
      any
    >;
  };
  checkIconCodeDuplicate = (): Record<string, any> => {
    const stmt = this.db!.prepare(
      `SELECT iconCode,COUNT(*) FROM ${iconData} GROUP BY iconCode HAVING COUNT(*) > 1`
    );
    stmt.step();
    const res = stmt.getAsObject();
    return res;
  };
  formatIconDataFromFilePath = (path: string, targetGroup: string): DataSet => {
    const { electronAPI } = window;
    const fileData = electronAPI.readFileSync(path, 'utf-8');
    const svg = new SVG(fileData);
    const content = sf(svg.formatSVG().getOuterHTML());
    return {
      id: sf(generateUUID()),
      iconCode: sf(this.getNewIconCode() as string),
      iconName: sf(nameOfFile(nameOfPath(path))),
      iconGroup: sf(targetGroup),
      iconSize: electronAPI.statSync(path).size,
      iconType: sf(typeOfFile(nameOfPath(path))),
      iconContent: content,
      iconContentOriginal: content,
    };
  };
  formatIconDataFromData = (obj: IconImportData, targetGroup: string): DataSet => {
    const svg = new SVG(obj.iconContent);
    const content = sf(svg.formatSVG().getOuterHTML());
    return {
      id: sf(generateUUID()),
      iconCode: sf(this.getNewIconCode() as string),
      iconName: sf(obj.iconName),
      iconGroup: sf(targetGroup),
      iconSize: sizeOfString(obj.iconContent),
      iconType: sf(obj.iconType),
      iconContent: content,
      iconContentOriginal: content,
    };
  };
  formatIconDataFromCpData = (obj: CpIconData, targetGroup: string): DataSet => {
    const svg = new SVG(obj.glyph);
    const content = sf(svg.formatSVG().getOuterHTML());
    return {
      id: sf(generateUUID()),
      iconCode: sf(obj.unicodeNum.toUpperCase()),
      iconName: sf(obj.name),
      iconGroup: sf(targetGroup),
      iconSize: obj.size * 512,
      iconType: sf('svg'),
      iconContent: content,
      iconContentOriginal: content,
    };
  };
  // 获取一个可用的图标字码
  getNewIconCode = (type?: string, test?: boolean): string | number => {
    dev && console.log('getNewIconCode');
    const rawData = this.db!.exec(`SELECT iconCode from ${iconData}`);
    if (rawData.length) {
      // Set 查找 O(1)，总复杂度 O(n) 而非 O(n×m)
      const usedCodeSet = new Set(
        rawData[0].values.map((code: any[]) => hexToDec(code[0] as string))
      );
      for (const code of config.publicRangeUnicodeDecList) {
        if (!usedCodeSet.has(code)) {
          return type === 'dec' ? code : decToHex(code);
        }
      }
      // 所有字码用完
      return type === 'dec' ? config.publicRangeUnicodeDecMin : config.publicRangeUnicodeHexMin;
    } else {
      return type === 'dec' ? config.publicRangeUnicodeDecMin : config.publicRangeUnicodeHexMin;
    }
  };
  // 测试图标字码是否在可用字码段内
  iconCodeInRange = (iconCode: string): boolean => {
    dev && console.log('iconCodeInRange');
    return (
      iconCode.length === 4 &&
      hexToDec(iconCode) >= config.publicRangeUnicodeDecMin &&
      hexToDec(iconCode) <= config.publicRangeUnicodeDecMax
    );
  };
  // 测试图标字码是否可用
  iconCodeCanUse = (iconCode: string): boolean => {
    dev && console.log('iconCodeCanUse');
    const targetDataSet: DataSet = { iconCode: sf(iconCode).toUpperCase() };
    return (
      !this.getDataOfTable(iconData, targetDataSet, { where: true }) &&
      this.iconCodeInRange(iconCode)
    );
  };
  addIcons = (
    iconFilesData: (IconFileData | File)[],
    targetGroup: string,
    callback?: () => void
  ): void => {
    dev && console.log('addIcons');
    const group = targetGroup === 'resource-all' ? 'resource-uncategorized' : targetGroup;
    let pending = iconFilesData.length;
    if (pending === 0) {
      callback && callback();
      return;
    }

    const done = () => {
      if (--pending <= 0) {
        this.notifyMutation();
        callback && callback();
      }
    };

    iconFilesData.forEach((data) => {
      const filePath = (data as any).path;
      if (filePath && typeof filePath === 'string' && filePath.length > 1) {
        // Electron File with real path — read via fs
        const dataSet = this.formatIconDataFromFilePath(filePath, group);
        this.addDataToTable(iconData, dataSet);
        done();
      } else {
        // Browser File without path — read via FileReader
        const file = data as File;
        const reader = new FileReader();
        reader.onload = () => {
          const content = reader.result as string;
          const dataSet = this.formatIconDataFromData(
            {
              iconName: file.name.replace(/\.[^.]+$/, ''),
              iconContent: content,
              iconType: file.name.split('.').pop() || 'svg',
            },
            group
          );
          this.addDataToTable(iconData, dataSet);
          done();
        };
        reader.readAsText(file);
      }
    });
  };
  addIconsFromData = (
    iconFilesData: IconImportData[],
    targetGroup: string,
    callback?: () => void
  ): void => {
    dev && console.log('addIcons');
    iconFilesData.forEach((data) => {
      // 如果加入到 all 分组, 则转换为加入 未分类 分组
      const dataSet = this.formatIconDataFromData(
        data,
        targetGroup === 'resource-all' ? 'resource-uncategorized' : targetGroup
      );
      this.addDataToTable(iconData, dataSet);
    });
    this.notifyMutation();
    callback && callback();
  };
  addIconsFromCpData = (
    iconFilesData: CpIconData[],
    targetGroup: string,
    callback?: () => void
  ): void => {
    dev && console.log('addIcons');
    iconFilesData.forEach((data) => {
      // 如果是原始 cp 的 未分类 分组, 则转换为加入 未分类 分组
      const dataSet = this.formatIconDataFromCpData(
        data,
        targetGroup === '未分类' ? 'resource-uncategorized' : targetGroup
      );
      this.addDataToTable(iconData, dataSet);
    });
    this.notifyMutation();
    callback && callback();
  };
  delIcon = (id: string, callback?: () => void): void => {
    dev && console.log('delIcon');
    const targetDataSet: DataSet = { id: sf(id) };
    this.delDataOfTable(iconData, targetDataSet, { all: false });
    this.notifyMutation();
    callback && callback();
  };
  // 获取所有图标数
  getIconCount = (): number => {
    dev && console.log('getIconCount');
    return this.getDataCountsOfTable(iconData);
  };
  // 从特定组中获取图标数
  getIconCountFromGroup = (targetGroup: string): number => {
    dev && console.log('getIconCountFromGroup');
    const targetDataSet: DataSet = { iconGroup: sf(targetGroup) };
    return this.getDataCountsOfTable(iconData, targetDataSet);
  };
  // 取最近更新的图标 (按 updateTime 降序，默认50个)
  getRecentlyUpdatedIcons = (limit: number = 50): Record<string, any>[] => {
    dev && console.log('getRecentlyUpdatedIcons');
    const rawData = this.db!.exec(
      `SELECT ${Database.ICON_META_COLS} FROM ${iconData} WHERE iconGroup != 'resource-deleted' AND iconGroup != 'resource-recycleBin' ORDER BY updateTime DESC LIMIT ${limit}`
    );
    if (rawData.length === 0) return [];
    const colNameList = rawData[0].columns;
    return rawData[0].values.map((row) => {
      const rowData: Record<string, any> = {};
      row.forEach((colData: any, index: number) => {
        rowData[colNameList[index]] = colData;
      });
      return rowData;
    });
  };
  // 取所有图标
  getIconList = (): Record<string, any>[] => {
    dev && console.log('getIconList');
    const targetDataSet: DataSet = { iconGroup: sf('resource-deleted') };
    return (this.getDataOfTable(iconData, targetDataSet, { where: true, equal: false }) ||
      []) as Record<string, any>[];
  };
  // ── Metadata-only columns (excludes heavy iconContent/iconContentOriginal TEXT) ──
  // Used for grid listing — content loaded lazily per-icon when visible
  static ICON_META_COLS =
    'id, iconCode, iconName, iconGroup, iconSize, iconType, createTime, updateTime';

  // 单次查询所有图标并按 group 分组（resource-all 视图用）— 仅元数据，不含 SVG 内容
  getAllIconsGrouped = (): Record<string, Record<string, any>[]> => {
    dev && console.log('getAllIconsGrouped');
    const p = (window as any).__BOBCORN_PERF__;
    p?.mark('db.getAllIconsGrouped');
    const rawData = this.db!.exec(
      `SELECT ${Database.ICON_META_COLS} FROM ${iconData} WHERE iconGroup != 'resource-deleted' AND iconGroup != 'resource-recycleBin'`
    );
    const result: Record<string, Record<string, any>[]> = {};
    if (rawData.length === 0) return result;
    const colNameList = rawData[0].columns;
    rawData[0].values.forEach((row) => {
      const rowData: Record<string, any> = {};
      row.forEach((colData: any, index: number) => {
        rowData[colNameList[index]] = colData;
      });
      const group = rowData.iconGroup || 'resource-uncategorized';
      if (!result[group]) result[group] = [];
      result[group].push(rowData);
    });
    // null 分组合并到 uncategorized
    if (result['null']) {
      result['resource-uncategorized'] = (result['resource-uncategorized'] || []).concat(
        result['null']
      );
      delete result['null'];
    }
    p?.measure('db.getAllIconsGrouped');
    return result;
  };

  // 获取单个图标的 SVG 内容 — 用于虚拟化按需加载
  getIconContent = (id: string): string => {
    const stmt = this.db!.prepare(`SELECT iconContent FROM ${iconData} WHERE id = ?`);
    stmt.bind([id]);
    if (stmt.step()) {
      const result = stmt.get();
      stmt.free();
      return (result[0] as string) || '';
    }
    stmt.free();
    return '';
  };

  /** Lazy backfill: if iconContentOriginal is NULL, copy current iconContent into it.
   *  Called before any content mutation to preserve the pre-edit baseline. */
  ensureOriginalContent = (id: string): void => {
    const stmt = this.db!.prepare(`SELECT iconContentOriginal FROM ${iconData} WHERE id = ?`);
    stmt.bind([id]);
    if (stmt.step()) {
      const val = stmt.get()[0];
      stmt.free();
      if (val === null || val === undefined) {
        this.db!.run(
          `UPDATE ${iconData} SET iconContentOriginal = iconContent WHERE id = ${sf(id)}`
        );
      }
    } else {
      stmt.free();
    }
  };

  /** Centralized fallback: returns original content for color reset, handling legacy NULL rows. */
  getOriginalContent = (data: Record<string, any>): string => {
    return (data.iconContentOriginal ?? data.iconContent ?? '') as string;
  };

  // 从特定组中取图标 — 仅元数据，不含 SVG 内容
  getIconListFromGroup = (targetGroup: string | string[]): Record<string, any>[] => {
    dev && console.log('getIconListFromGroup');
    const cols = Database.ICON_META_COLS;
    if (typeof targetGroup === 'string') {
      if (targetGroup === 'resource-all') {
        const rawData = this.db!.exec(`SELECT ${cols} FROM ${iconData}`);
        if (rawData.length === 0) return [];
        const colNameList = rawData[0].columns;
        return rawData[0].values.map((row) => {
          const rowData: Record<string, any> = {};
          row.forEach((colData: any, index: number) => {
            rowData[colNameList[index]] = colData;
          });
          return rowData;
        });
      } else {
        const rawData = this.db!.exec(
          `SELECT ${cols} FROM ${iconData} WHERE iconGroup = ${sf(targetGroup)}`
        );
        if (rawData.length === 0) return [];
        const colNameList = rawData[0].columns;
        return rawData[0].values.map((row) => {
          const rowData: Record<string, any> = {};
          row.forEach((colData: any, index: number) => {
            rowData[colNameList[index]] = colData;
          });
          return rowData;
        });
      }
    } else if (Array.isArray(targetGroup) && targetGroup.length > 0) {
      const inClause = targetGroup.map((id) => sf(id)).join(',');
      const rawData = this.db!.exec(
        `SELECT ${cols} FROM ${iconData} WHERE iconGroup IN (${inClause})`
      );
      if (rawData.length === 0) return [];
      const colNameList = rawData[0].columns;
      return rawData[0].values.map((row) => {
        const rowData: Record<string, any> = {};
        row.forEach((colData: any, index: number) => {
          rowData[colNameList[index]] = colData;
        });
        return rowData;
      });
    }
    return [];
  };
  setIconName = (id: string, iconName: string, callback?: () => void): void => {
    dev && console.log('setIconName');
    const dataSet: DataSet = { iconName: sf(iconName) };
    this.setIconData(id, dataSet, callback);
  };
  setIconCode = (id: string, newIconCode: string, callback?: () => void): void => {
    dev && console.log('setIconCode');
    const dataSet: DataSet = { iconCode: sf(newIconCode).toUpperCase() };
    this.setIconData(id, dataSet, callback);
  };
  moveIconGroup = (id: string, targetGroup: string, callback?: () => void): void => {
    dev && console.log('moveIconGroup');
    const targetDataSet: DataSet = { id: sf(id) };
    // 如果移动到all分组, 则转换为加入未分类分组
    const dataSet: DataSet = {
      iconGroup: sf(targetGroup === 'resource-all' ? 'resource-uncategorized' : targetGroup),
    };
    this.setDataOfTable(iconData, targetDataSet, dataSet);
    this.notifyMutation();
    callback && callback();
  };
  duplicateIconGroup = (id: string, targetGroup: string, callback?: () => void): void => {
    dev && console.log('duplicateIconGroup');
    const sourceIconData = this.getIconData(id);
    // 重新生成UUID与字码
    const dataSet: DataSet = {
      id: sf(generateUUID()),
      iconCode: sf(this.getNewIconCode() as string),
      iconName: sf(sourceIconData.iconName),
      // 如果复制到all分组, 则转换为加入未分类分组
      iconGroup: sf(targetGroup === 'resource-all' ? 'resource-uncategorized' : targetGroup),
      iconSize: sourceIconData.iconSize,
      iconType: sf(sourceIconData.iconType),
      iconContent: sf(sourceIconData.iconContent),
      iconContentOriginal: sf(this.getOriginalContent(sourceIconData)),
    };
    this.addDataToTable(iconData, dataSet);
    this.notifyMutation();
    callback && callback();
  };
  // ── Batch operations ─────────────────────────────────────────────
  moveIcons = (ids: string[], targetGroup: string, callback?: () => void): void => {
    dev && console.log('moveIcons');
    const group = targetGroup === 'resource-all' ? 'resource-uncategorized' : targetGroup;
    const placeholders = ids.map(() => '?').join(',');
    this.db!.run(`UPDATE ${iconData} SET iconGroup = ? WHERE id IN (${placeholders})`, [
      group,
      ...ids,
    ]);
    this.notifyMutation();
    callback && callback();
  };
  delIcons = (ids: string[], callback?: () => void): void => {
    dev && console.log('delIcons');
    const placeholders = ids.map(() => '?').join(',');
    this.db!.run(`DELETE FROM ${iconData} WHERE id IN (${placeholders})`, ids);
    this.notifyMutation();
    callback && callback();
  };
  duplicateIcons = (ids: string[], targetGroup: string, callback?: () => void): void => {
    dev && console.log('duplicateIcons');
    const group = targetGroup === 'resource-all' ? 'resource-uncategorized' : targetGroup;
    ids.forEach((id) => {
      const source = this.getIconData(id);
      const dataSet: DataSet = {
        id: sf(generateUUID()),
        iconCode: sf(this.getNewIconCode() as string),
        iconName: sf(source.iconName),
        iconGroup: sf(group),
        iconSize: source.iconSize,
        iconType: sf(source.iconType),
        iconContent: sf(source.iconContent),
        iconContentOriginal: sf(this.getOriginalContent(source)),
      };
      this.addDataToTable(iconData, dataSet);
    });
    this.notifyMutation();
    callback && callback();
  };
  updateIconsColor = (ids: string[], targetColor: string, callback?: () => void): void => {
    dev && console.log('updateIconsColor');
    ids.forEach((id) => {
      this.ensureOriginalContent(id);
      const icon = this.getIconData(id);
      let content = icon.iconContent;
      const colors = extractSvgColors(content);
      colors.forEach((c: { color: string }) => {
        content = replaceSvgColor(content, c.color, targetColor);
      });
      const escaped = content.replace(/'/g, "''");
      this.setIconData(id, { iconContent: `'${escaped}'` });
    });
    callback && callback();
  };

  renewIconData = (id: string, newIconFileData: RenewIconFileData, callback?: () => void): void => {
    dev && console.log('renewIconData');
    const { electronAPI } = window;
    const content = sf(electronAPI.readFileSync(newIconFileData.path, 'utf-8'));
    // 更新 size, type, content 以及原始内容
    const dataSet: DataSet = {
      id: sf(newIconFileData.id),
      iconCode: sf(newIconFileData.iconCode),
      iconName: sf(newIconFileData.iconName),
      iconGroup: sf(newIconFileData.iconGroup),
      iconSize: electronAPI.statSync(newIconFileData.path).size,
      iconType: sf(typeOfFile(nameOfPath(newIconFileData.path))),
      iconContent: content,
      iconContentOriginal: content,
    };
    this.setIconData(id, dataSet, callback);
  };

  // 测试用
  test = (): void => {
    // // Run a query without reading the results
    // db.run("CREATE TABLE test (col1, col2);");
    // // Insert two rows: (1,111) and (2,222)
    // db.run("INSERT INTO test VALUES (?,?), (?,?)", [1,111,2,222]);
    // // Prepare a statement
    // var stmt = db.prepare("SELECT * FROM test WHERE col1 BETWEEN $start AND $end");
    // console.log(stmt.getAsObject({$start:1, $end:1})); // {col1:1, col2:111}
    console.log(this.db!.run('SELECT * FROM projectAttributes'));
  };
}

const db = new Database();
const dbReady: Promise<Database> = db.init().then(() => {
  db.initNewProject();
  // DEBUG
  (window as any).db = db;
  return db;
});
export default db;
export { Database, dbReady };
