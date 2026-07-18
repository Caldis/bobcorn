const dev: boolean = import.meta.env?.DEV ?? false;

// SVG
import SVG from '../utils/svg';
import { extractSvgColors, replaceSvgColor } from '../utils/svg/colors';
// SQLite (use ASM build - pure JS, no WASM file needed)
import initSqlJs from 'sql.js/dist/sql-asm.js';
// eslint-disable-next-line no-restricted-imports -- safe-stmt is sanctioned shared plumbing (sql.js statement lifecycle wrapper), not a business database surface; see test/unit/sqljs-statement-guard.test.js
import {
  queryFirstRow,
  queryFirstValue,
  type SqlJsSafeStatement,
} from '../../core/database/safe-stmt';
// Stage C strangler: renderer 壳层持有 core ProjectDb 委托实例, 方法体逐簇改为委托。
// 深路径 import 是 renderer-safe 的 (纯包装, 无 Node builtin) — 见 core-boundary-guard。
// eslint-disable-next-line no-restricted-imports -- Stage C strangler delegation target; deep path is renderer-safe, see test/unit/core-boundary-guard.test.js
import { ProjectDb } from '@core/database/project-db';
// Stage C 簇③: 删除/移动/复制/替换写方法委托 commands 纯命令体 (renderer-safe, 无 Node builtin —
// 见 test/unit/core-boundary-guard.test.js 的 commands 守门)
import {
  moveIcons as commandMoveIcons,
  deleteIcons as commandDeleteIcons,
  copyIcons as commandCopyIcons,
  replaceIconContent as commandReplaceIconContent,
} from '@core/commands';
// Config
import config, { getOption } from '../config';
// Shared icon-code allocation — single source of truth with the CLI (core)
import { highestUsedInRange, PUA_MIN, PUA_MAX, type CodeRange } from '@core/code-allocation';
// Utils
import {
  generateUUID,
  sf,
  nameOfPath,
  nameOfFile,
  typeOfFile,
  hexToDec,
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
  variantOf?: string | null;
  variantMeta?: string | null;
  createTime?: string;
  updateTime?: string;
}

/** Group data as stored in the database */
export interface GroupData {
  id: string;
  groupName: string;
  groupOrder: number;
  groupColor?: string;
  groupDescription?: string;
  groupIcon?: string;
  /** Optional per-group PUA code range (decimal code points). */
  codeRangeStart?: number | null;
  codeRangeEnd?: number | null;
  createTime?: string;
  updateTime?: string;
}

/** Project attributes as stored in the database */
export interface ProjectAttributes {
  id: string;
  projectName: string;
  displayName?: string;
  description?: string;
  projectColor?: string;
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
  prepare(sql: string): SqlJsSafeStatement;
  export(): Uint8Array;
  close(): void;
}

interface SqlJsQueryResult {
  columns: string[];
  values: any[][];
}

// 表结构数据 (触发器名常量随建表/迁移 SQL 一并收口进 @core/database/project-db)
const projectAttributes = 'projectAttributes';
const groupData = 'groupData';
const iconData = 'iconData';

// 分配模式跟随设置 codeAllocationMode (localStorage — core 不读浏览器状态)。
// 模块级辅助 (0 缩进) — 不进入 parity 冻结的类方法面; 委托 commands 的写方法
// (move/copy) 经此把壳层职责 (读设置) 转译为 command 的 codeMode 参数。
// 导出供 store 薄封装 (batch actions) 组装 move/copy 命令的 codeMode 参数。
export function currentCodeMode(): 'append' | 'fill' {
  try {
    return ((getOption('codeAllocationMode') as string) || 'append') === 'fill' ? 'fill' : 'append';
  } catch {
    return 'append'; // localStorage 不可用时用默认
  }
}

class Database {
  dbInited: boolean;
  db: SqlJsDatabase | null;
  SQL: SqlJsStatic | null;
  unusedIconCodeList: number[] | null;

  // Stage C strangler 委托实例 — 包一层 this.db 的引用 (无状态), this.db 换实例时必须同步重建。
  // 非 private: 模块级 getCoreDb() 需要经单例访问 (普通属性, 不进入 parity 冻结的方法面)。
  coreDb: ProjectDb | null = null;

  // Mutation tracking — single callback for dirty state
  private onMutationCallback: (() => void) | null = null;
  registerOnMutation = (cb: () => void): void => {
    this.onMutationCallback = cb;
  };
  private notifyMutation = (): void => {
    this.onMutationCallback?.();
  };

  // 内容变更广播 (renderer-only UI 插桩, 无业务语义, 与 registerOnMutation 同款) —
  // bootstrap 注册 → store.invalidateIconContent。所有 iconContent 写入路径
  // (setIconData 及其调用者 renewIconData/updateIconsColor/改色等) 在数据层统一
  // 广播, 画布内容缓存的失效收口于此, 写入 callsite 无需再手工 patch/同步
  private onIconContentChangedCallback: ((ids: string[]) => void) | null = null;
  registerOnIconContentChanged = (cb: (ids: string[]) => void): void => {
    this.onIconContentChangedCallback = cb;
  };
  // 批量写入 (updateIconsColor) 抑制逐条广播, 循环结束后一次性 emit
  private suppressContentEmit = false;
  private emitIconContentChanged = (ids: string[]): void => {
    if (this.suppressContentEmit || ids.length === 0) return;
    this.onIconContentChangedCallback?.(ids);
  };

  // Stage C 委托骨架: 模块级 notifyExternalMutation() 的类内转发通道。
  // core 写路径绕过类内写方法, 完成后由壳层经此补齐同款插桩: dirty 标记 + (可选) 内容失效广播。
  // 普通方法 (非箭头函数类字段) — 不进入 parity 冻结的方法面。
  notifyExternalMutation(contentChangedIds?: string[]): void {
    this.notifyMutation();
    if (contentChangedIds && contentChangedIds.length > 0) {
      this.emitIconContentChanged(contentChangedIds);
    }
  }

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
      // ProjectDb 只是包一层引用 (无状态) — this.db 换新实例时必须同步重建委托实例
      this.coreDb = new ProjectDb(this.db);
      p?.measure('db.sqljs_deserialize');
      // Migration (打开既有项目文件时): 委托 core runMigrations() — 幂等, 覆盖原内联块的全部
      // ALTER (iconContentOriginal / isFavorite / groupDescription / codeRange* /
      // displayName / description / projectColor), 外加 groupIcon 列、清理触发器重建与
      // 孤儿 groupIcon 修复、variant 列与索引 (原先散布在 ensureGroupIconColumn /
      // migrateVariantColumns, 由 initNewProjectFromData 补跑 — 现统一收口于此)。
      // iconContentOriginal 仍无批量回填 — legacy 行保持 NULL, 由 ensureOriginalContent() 惰性回填。
      if (data) {
        try {
          p?.mark('db.migration_check');
          this.coreDb.runMigrations();
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
  // ── 写入基础方法 — 所有 C/U/D 必须经过这三个方法或 runMutation ──
  // 自动触发 notifyMutation()，上层方法不需要手动调用

  // 添加数据到TABLE, 注意使用时要根据数据格式自行添加单引号
  addDataToTable = (tableName: string, dataSet: DataSet, callback?: () => void): void => {
    dev && console.log('addDataToTable');
    this.db!.run(
      `INSERT INTO ${tableName} ${this.buildDataSTMT(dataSet, { needData: false })} VALUES ${this.buildDataSTMT(dataSet, { needName: false })}`
    );
    this.notifyMutation();
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
    this.db!.run(
      `UPDATE ${tableName} SET ${this.buildDataSTMT(dataSet)} WHERE ${this.buildDataSTMT(targetDataSet)}`
    );
    this.notifyMutation();
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
        res = queryFirstRow(
          this.db!,
          `SELECT * FROM ${tableName} WHERE ${this.buildDataSTMT(targetDataSet!, { equal: opts.equal })}`
        );
      } else {
        res = queryFirstRow(this.db!, `SELECT * FROM ${tableName}`);
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
    const defaultOptions: Required<DelDataOptions> = { all: false };
    const opts = Object.assign(defaultOptions, options);
    if (opts.all) {
      this.db!.exec(`DELETE FROM ${tableName}`);
    } else {
      this.db!.exec(`DELETE FROM ${tableName} WHERE ${this.buildDataSTMT(targetDataSet)}`);
    }
    this.notifyMutation();
    callback && callback();
  };

  /** Run a raw SQL write statement with automatic mutation tracking.
   *  Use this instead of this.db!.run() for any INSERT/UPDATE/DELETE
   *  that bypasses addDataToTable/setDataOfTable/delDataOfTable. */
  private runMutation = (sql: string, params?: any[]): void => {
    if (params) {
      this.db!.run(sql, params);
    } else {
      this.db!.run(sql);
    }
    this.notifyMutation();
  };
  // 统计TABLE总行数
  getDataCountsOfTable = (tableName: string, targetDataSet?: DataSet): number => {
    dev && console.log('getDataCountsOfTable');
    if (targetDataSet) {
      dev &&
        console.log(`SELECT COUNT(*) FROM ${tableName} WHERE ${this.buildDataSTMT(targetDataSet)}`);
      return queryFirstRow(
        this.db!,
        `SELECT COUNT(*) FROM ${tableName} WHERE ${this.buildDataSTMT(targetDataSet)}`
      )['COUNT(*)'] as number;
    } else {
      dev && console.log(`SELECT COUNT(*) FROM ${tableName}`);
      return queryFirstRow(this.db!, `SELECT COUNT(*) FROM ${tableName}`)['COUNT(*)'] as number;
    }
  };
  // 删库跑路~
  destroyDatabase = (): void => {
    dev && console.log('destroyDatabase');
    if (this.db) {
      try {
        this.db.close();
      } catch {
        /* already closed */
      }
    }
    this.dbInited = false;
    this.db = null;
    this.coreDb = null;
  };

  // 项目相关
  // 初始化新项目
  initNewProject = (projectName?: string, displayName?: string): void => {
    dev && console.log('initNewProject');
    // 委托 core initSchema (建表/触发器/索引/初始行与原实现逐行等价, 由
    // test/unit/renderer-core-schema-parity.test.js 对拍守门)。
    // 壳层保留 renderer 语义适配: 空 projectName 回退 'iconfont'; displayName 先 trim (纯空白视为空)。
    // projectName = 图标字码前缀 (技术用); displayName = 项目名称 (用户可见, 可空, UI 回退显示文件名)
    const trimmedDisplay = displayName && displayName.trim() ? displayName.trim() : undefined;
    this.coreDb!.initSchema(projectName || 'iconfont', trimmedDisplay);
  };
  // 从文件初始化新项目
  initNewProjectFromData = (data: ArrayLike<number>): void => {
    dev && console.log('initNewProjectFromFile');
    this.destroyDatabase();
    // initDatabases(data) 内部已委托 core runMigrations() — 覆盖旧版 .icp 的 variant 列
    // 与 groupIcon/codeRange 列等全部迁移, 无需再单独补跑 ensure*/migrate*
    this.initDatabases(data);
  };

  private migrateVariantColumns = (): void => {
    // 委托 core runMigrations (幂等) — 含 variantOf/variantMeta 列与 idx_iconData_variantOf 索引
    this.coreDb?.runMigrations();
  };
  // 重置项目 (projectName = 图标字码前缀, displayName = 项目名称)
  resetProject = (projectName?: string, displayName?: string): void => {
    dev && console.log('resetProject');
    this.destroyDatabase();
    this.initDatabases();
    this.initNewProject(projectName, displayName);
    // notifyMutation auto-fired by initNewProject → addDataToTable
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
    this.setDataOfTable(projectAttributes, targetDataSet, dataSet, callback);
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

  // Display name (separate from font prefix)
  getProjectDisplayName = (): string | null => {
    return this.getProjectAttributes('displayName') || null;
  };
  setProjectDisplayName = (displayName: string | null, callback?: () => void): void => {
    if (displayName !== null) {
      this.setProjectAttributes({ displayName: sf(displayName) }, callback);
    } else {
      this.runMutation(
        `UPDATE ${projectAttributes} SET displayName = NULL WHERE id = 'projectAttributes'`
      );
      callback?.();
    }
  };

  // Project description
  getProjectDescription = (): string | null => {
    return this.getProjectAttributes('description') || null;
  };
  setProjectDescription = (description: string | null, callback?: () => void): void => {
    if (description !== null) {
      this.setProjectAttributes({ description: sf(description) }, callback);
    } else {
      this.runMutation(
        `UPDATE ${projectAttributes} SET description = NULL WHERE id = 'projectAttributes'`
      );
      callback?.();
    }
  };

  // Project color (avatar color override)
  getProjectColor = (): string | null => {
    return this.getProjectAttributes('projectColor') || null;
  };
  setProjectColor = (color: string | null, callback?: () => void): void => {
    if (color !== null) {
      this.setProjectAttributes({ projectColor: sf(color) }, callback);
    } else {
      this.runMutation(
        `UPDATE ${projectAttributes} SET projectColor = NULL WHERE id = 'projectAttributes'`
      );
      callback?.();
    }
  };

  // Project stats (read-only aggregates)
  getProjectStats = (): {
    iconCount: number;
    groupCount: number;
    createTime: string | null;
    updateTime: string | null;
  } => {
    const iconCount = this.getDataCountsOfTable(iconData);
    const groupCount = this.getDataCountsOfTable(groupData);
    const createTime = this.getProjectAttributes('createTime') || null;
    const updateTime = this.getProjectAttributes('updateTime') || null;
    return { iconCount, groupCount, createTime, updateTime };
  };

  // 分组相关
  addGroupData = (dataSet: DataSet, callback?: () => void): void => {
    dev && console.log('addGroupData');
    this.addDataToTable(groupData, dataSet, callback);
  };
  setGroupData = (id: string, dataSet: DataSet, callback?: () => void): void => {
    dev && console.log('setGroupData');
    const targetDataSet: DataSet = { id: sf(id) };
    this.setDataOfTable(groupData, targetDataSet, dataSet, callback);
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
    callback?: (group: { id: string; groupName: string; groupOrder: number }) => void,
    description?: string
  ): void => {
    dev && console.log('addGroup');
    const id = generateUUID();
    const groupOrder = this.getDataCountsOfTable(groupData);
    const dataSet: DataSet = {
      id: sf(id),
      groupName: sf(name),
      groupOrder,
    };
    if (description) {
      this.ensureGroupDescriptionColumn();
      dataSet.groupDescription = sf(description);
    }
    this.addGroupData(dataSet);
    // notifyMutation auto-fired by addGroupData → addDataToTable
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
    this.runMutation(
      `UPDATE ${iconData} SET iconGroup = 'resource-uncategorized' WHERE iconGroup = ${sf(id)}`
    );
    // 然后删除分组 — delDataOfTable auto-notifies
    const targetDataSet: DataSet = { id: sf(id) };
    this.delDataOfTable(groupData, targetDataSet, { all: false }, callback);
  };
  getGroupList = (): Record<string, any>[] => {
    dev && console.log('getGroupList');
    const p = (window as any).__BOBCORN_PERF__;
    p?.mark('db.getGroupList');
    // 委托 core (SELECT * ORDER BY groupOrder ASC, 行→对象形状一致); perf 插桩留在壳层
    const result = this.coreDb!.getGroupList() as unknown as Record<string, any>[];
    p?.measure('db.getGroupList');
    return result;
  };
  // 批量更新分组排序
  reorderGroups = (orderedIds: string[], callback?: () => void): void => {
    dev && console.log('reorderGroups');
    orderedIds.forEach((id, index) => {
      this.runMutation(`UPDATE ${groupData} SET groupOrder = ${index} WHERE id = '${id}'`);
    });
    callback && callback();
  };
  setGroupName = (id: string, groupName: string, callback?: () => void): void => {
    dev && console.log('setGroupName');
    const dataSet: DataSet = { groupName: sf(groupName) };
    this.setGroupData(id, dataSet, callback);
  };
  // codeRange 语义: undefined = 不动区间列 (保持原值); null = 清除区间; {start,end} = 设置并校验。
  // 校验复用 @core/code-allocation 的 PUA 边界常量, 与 core setGroupCodeRange 对齐 (PUA 内 + start<=end + 与其他组不重叠);
  // 违规抛错 (调用方 try/catch), 正常路径由弹窗层的行内校验拦截, 此处为落库前的兜底防线。
  setGroupInfo = (
    id: string,
    groupName: string,
    groupDescription: string | null,
    callback?: () => void,
    groupIcon?: string | null,
    codeRange?: { start: number; end: number } | null
  ): void => {
    dev && console.log('setGroupInfo');
    // 确保 groupDescription / groupIcon / codeRange* 列存在（HMR 热更新时可能还没跑过 migration）
    this.ensureGroupDescriptionColumn();
    this.ensureGroupIconColumn();
    const dataSet: DataSet = {
      groupName: sf(groupName),
      groupDescription: groupDescription ? sf(groupDescription) : 'NULL',
    };
    if (groupIcon !== undefined) {
      dataSet.groupIcon = groupIcon ? sf(groupIcon) : 'NULL';
    }
    if (codeRange !== undefined) {
      if (codeRange === null) {
        dataSet.codeRangeStart = 'NULL';
        dataSet.codeRangeEnd = 'NULL';
      } else {
        const { start, end } = codeRange;
        if (
          !Number.isInteger(start) ||
          !Number.isInteger(end) ||
          start < PUA_MIN ||
          end > PUA_MAX ||
          start > end
        ) {
          throw new Error('INVALID_CODE_RANGE');
        }
        // 与其他分组已声明区间不重叠 (内联查询, 不新增读方法)
        const others = this.db!.exec(
          `SELECT codeRangeStart, codeRangeEnd FROM ${groupData} WHERE id != ${sf(id)} AND codeRangeStart IS NOT NULL AND codeRangeEnd IS NOT NULL`
        );
        if (others.length) {
          for (const v of others[0].values) {
            const os = Number(v[0]);
            const oe = Number(v[1]);
            if (Number.isFinite(os) && Number.isFinite(oe) && start <= oe && os <= end) {
              throw new Error('CODE_RANGE_OVERLAP');
            }
          }
        }
        dataSet.codeRangeStart = String(start);
        dataSet.codeRangeEnd = String(end);
      }
    }
    this.setGroupData(id, dataSet, callback);
  };
  private ensureGroupDescriptionColumn = (): void => {
    // 委托 core runMigrations (幂等) — 含 groupDescription 列 (HMR 热更新时可能还没跑过 migration)
    this.coreDb?.runMigrations();
  };
  private ensureGroupIconColumn = (): void => {
    // 委托 core runMigrations (幂等) — 含 groupIcon/codeRangeStart/codeRangeEnd 列、
    // 清理触发器重建 (drop + create) 与孤儿 groupIcon 修复
    this.coreDb?.runMigrations();
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
    this.setDataOfTable(iconData, targetDataSet, dataSet, callback);
    // iconContent 写入 → 广播失效 (画布缓存收口点, 勿在 callsite 手工同步)
    if ('iconContent' in dataSet) {
      this.emitIconContentChanged([id]);
    }
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
    return queryFirstRow(
      this.db!,
      `SELECT iconCode,COUNT(*) FROM ${iconData} GROUP BY iconCode HAVING COUNT(*) > 1`
    );
  };
  formatIconDataFromFilePath = (path: string, targetGroup: string): DataSet => {
    const { electronAPI } = window;
    const fileData = electronAPI.readFileSync(path, 'utf-8');
    const svg = new SVG(fileData);
    const content = sf(svg.formatSVG().getOuterHTML());
    return {
      id: sf(generateUUID()),
      iconCode: sf(this.requireNewIconCode(targetGroup)),
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
      iconCode: sf(this.requireNewIconCode(targetGroup)),
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
  // 全表重复字码列表 (归一化大写) — 供网格/编辑器撞码标识, 单次 GROUP BY 避免 N+1
  getDuplicateIconCodes = (): string[] => {
    dev && console.log('getDuplicateIconCodes');
    // 委托 core (SQL 逐字相同)
    return this.coreDb!.getDuplicateIconCodes();
  };
  // 获取全部图标字码原始值 (含回收站/已删除/变体, 不做任何过滤) — 供字码覆盖可视化
  getAllIconCodes = (): string[] => {
    dev && console.log('getAllIconCodes');
    const rawData = this.db!.exec(`SELECT iconCode FROM ${iconData}`);
    if (!rawData.length) return [];
    return rawData[0].values.map((row: any[]) => String(row[0] ?? ''));
  };

  // 获取当前已用的最高字码 (十进制, 限定在公共码点范围内); 空表或范围内无占用时返回 publicRangeUnicodeDecMin - 1
  // 供导入结果分类 (appended/filled) 取批次基准 — 与 getNewIconCode 的 append 分支逻辑独立计算, 便于在批次开始前单独取一次快照
  getHighestUsedIconCodeDec = (): number => {
    dev && console.log('getHighestUsedIconCodeDec');
    // 委托 core 已用码点集合 + 共享纯函数 (config.publicRangeUnicodeDec* == PUA E000-F8FF)
    return highestUsedInRange(
      this.coreDb!.getUsedIconCodesDec(),
      config.publicRangeUnicodeDecMin,
      config.publicRangeUnicodeDecMax
    );
  };
  // 获取一个可用的图标字码; 全局池 6400 个 PUA 码点全部用尽时返回 null (不再静默回退 E000 制造重复码)
  // 分配逻辑与 CLI (src/core) 逐行对齐, 复用同一 @core/code-allocation 纯函数:
  //   目标分组有区间 → 区间内 append/fill; 区间满抛 GROUP_RANGE_EXHAUSTED
  //   全局池 (未分组/无区间分组) → append/fill 但跳过所有已声明区间 (预留语义); 耗尽返回 null (PUA_EXHAUSTED)
  // 分配模式跟随设置 codeAllocationMode: append (默认) / fill
  // 区间数据在方法内部内联查询 (parity-guard 冻结方法面, 不新增读方法)
  getNewIconCode = (type?: string, targetGroupId?: string): string | number | null => {
    dev && console.log('getNewIconCode');
    // 壳层职责: 分配模式跟随设置 codeAllocationMode (localStorage — core 不读浏览器状态)
    let mode: 'append' | 'fill' = 'append';
    try {
      mode =
        ((getOption('codeAllocationMode') as string) || 'append') === 'fill' ? 'fill' : 'append';
    } catch {
      /* localStorage 不可用时用默认 */
    }
    // 委托 core (已用码点集合/目标区间/预留区间的查询与分配逻辑收口在 ProjectDb;
    // core 的 PUA 边界即 E000-F8FF, 与 config.publicRangeUnicodeDec* 相同)
    try {
      const hexCode = this.coreDb!.getNewIconCode(mode, targetGroupId);
      return type === 'dec' ? hexToDec(hexCode) : hexCode;
    } catch (e: any) {
      // 区间耗尽向上抛出 (调用方区分处理); 全局池耗尽退化为 null (兼容既有
      // requireNewIconCode/addVariant 契约); 其余错误 (如表不存在) 照旧上抛
      if (String(e?.message).startsWith('PUA_EXHAUSTED')) return null;
      throw e;
    }
  };
  // 获取一个可用的图标字码, 用尽时抛出 PUA_EXHAUSTED (供分配路径统一处理)
  requireNewIconCode = (targetGroupId?: string): string => {
    const code = this.getNewIconCode(undefined, targetGroupId);
    if (code === null) throw new Error('PUA_EXHAUSTED');
    return code as string;
  };
  // 计算字码修复计划 (dry-run, 不写库): 重复组保留第一个非回收站占用者, 其余行与非法码行重分配到空闲码点
  // 空闲码点不足时抛 PUA_EXHAUSTED
  planIconCodeFixes = (): {
    id: string;
    iconName: string;
    oldCode: string;
    newCode: string;
    reason: 'duplicate' | 'invalid';
  }[] => {
    dev && console.log('planIconCodeFixes');
    // 委托 core (算法逐行等价, PUA 边界 E000-F8FF == config.publicRangeUnicodeDec*)。
    // core 的耗尽错误带说明后缀, 壳层归一化为裸 'PUA_EXHAUSTED' —
    // 调用方 (CodeCoverageMatrix) 按 message 精确匹配
    try {
      return this.coreDb!.planIconCodeFixes();
    } catch (e: any) {
      if (String(e?.message).startsWith('PUA_EXHAUSTED')) throw new Error('PUA_EXHAUSTED');
      throw e;
    }
  };
  // 执行字码修复计划
  applyIconCodeFixes = (fixes: { id: string; newCode: string }[], callback?: () => void): void => {
    dev && console.log('applyIconCodeFixes');
    // 委托 core 执行 UPDATE (SQL 逐字相同); 写路径插桩 (dirty 标记) 留在壳层
    this.coreDb!.applyIconCodeFixes(fixes);
    this.notifyMutation();
    callback && callback();
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
    callback?: (result?: {
      added: number;
      failed: number;
      // 本批次分配性质统计 (v1.13 append/fill 分配模式反馈): appended = 分配码大于批次开始前已用最高码, filled = 分配码落入已用区间内的空闲孔洞
      appended?: number;
      filled?: number;
    }) => void
  ): void => {
    dev && console.log('addIcons');
    const group = targetGroup === 'resource-all' ? 'resource-uncategorized' : targetGroup;
    let pending = iconFilesData.length;
    if (pending === 0) {
      callback && callback({ added: 0, failed: 0, appended: 0, filled: 0 });
      return;
    }

    // 批次开始前取一次基准 (导入前已用的最大字码); 批次内后续追加的图标一律与此基准比较, 不与彼此比较, 避免批内互相比较误判
    // 目标组有区间时, 基准取"区间内"已用最高码 (而非全局), 使区间内的 appended/filled 分类仍然有意义
    let baselineMaxCode = this.getHighestUsedIconCodeDec();
    if (group && !group.startsWith('resource-')) {
      let range: CodeRange | null = null;
      try {
        const rr = this.db!.exec(
          `SELECT codeRangeStart, codeRangeEnd FROM ${groupData} WHERE id = ${sf(group)}`
        );
        if (rr.length && rr[0].values.length) {
          const [s, e] = rr[0].values[0];
          if (s !== null && s !== undefined && e !== null && e !== undefined) {
            range = { start: Number(s), end: Number(e) };
          }
        }
      } catch {
        /* 列尚未迁移出来 */
      }
      if (range) {
        const usedSet = new Set<number>();
        const allCodes = this.db!.exec(`SELECT iconCode FROM ${iconData}`);
        if (allCodes.length) {
          allCodes[0].values.forEach((row: any[]) => {
            const c = hexToDec(row[0] as string);
            if (Number.isFinite(c)) usedSet.add(c);
          });
        }
        baselineMaxCode = highestUsedInRange(usedSet, range.start, range.end);
      }
    }

    let added = 0;
    let failed = 0;
    let appended = 0;
    let filled = 0;
    // 依据分配到的字码 (sf 包裹的 SQL 字面量, 如 "'E000'") 与批次基准比较, 归类为 appended/filled
    const classifyAllocatedCode = (iconCodeLiteral: string | number) => {
      const raw = String(iconCodeLiteral).replace(/^'(.*)'$/, '$1');
      const dec = hexToDec(raw);
      if (Number.isFinite(dec) && dec > baselineMaxCode) {
        appended += 1;
      } else {
        filled += 1;
      }
    };
    const done = () => {
      if (--pending <= 0) {
        // notifyMutation auto-fired by each addDataToTable call
        callback && callback({ added, failed, appended, filled });
      }
    };

    iconFilesData.forEach((data) => {
      const filePath = (data as any).path;
      if (filePath && typeof filePath === 'string' && filePath.length > 1) {
        // Electron File with real path — read via fs
        try {
          const dataSet = this.formatIconDataFromFilePath(filePath, group);
          this.addDataToTable(iconData, dataSet);
          added += 1;
          classifyAllocatedCode(dataSet.iconCode);
        } catch {
          failed += 1; // 码点用尽
        }
        done();
      } else {
        // Browser File without path — read via FileReader
        const file = data as File;
        const reader = new FileReader();
        reader.onload = () => {
          const content = reader.result as string;
          try {
            const dataSet = this.formatIconDataFromData(
              {
                iconName: file.name.replace(/\.[^.]+$/, ''),
                iconContent: content,
                iconType: file.name.split('.').pop() || 'svg',
              },
              group
            );
            this.addDataToTable(iconData, dataSet);
            added += 1;
            classifyAllocatedCode(dataSet.iconCode);
          } catch {
            failed += 1; // 码点用尽
          }
          done();
        };
        reader.readAsText(file);
      }
    });
  };
  addIconsFromData = (
    iconFilesData: IconImportData[],
    targetGroup: string,
    callback?: (result?: { added: number; failed: number }) => void
  ): void => {
    dev && console.log('addIcons');
    let added = 0;
    let failed = 0;
    iconFilesData.forEach((data) => {
      // 如果加入到 all 分组, 则转换为加入 未分类 分组
      try {
        const dataSet = this.formatIconDataFromData(
          data,
          targetGroup === 'resource-all' ? 'resource-uncategorized' : targetGroup
        );
        this.addDataToTable(iconData, dataSet);
        added += 1;
      } catch {
        failed += 1; // 码点用尽
      }
    });
    // notifyMutation auto-fired by addDataToTable
    callback && callback({ added, failed });
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
    // notifyMutation auto-fired by addDataToTable
    callback && callback();
  };
  delIcon = (id: string, callback?: () => void): void => {
    dev && console.log('delIcon');
    // 委托 commands.deleteIcons 'permanent' (父+变体硬删)。原体只删本行 — 唯一真实调用方
    // (VariantPanel, variant-guard 豁免项) 删的是变体行, 变体无子变体, 数据层面等价。
    commandDeleteIcons(this.coreDb!, [id], 'permanent');
    // 写路径插桩留在壳层 — 时机与原 delDataOfTable 相同: 写后、callback 前
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
  // 导出集的字码元数据 (WHERE 条件与 getIconList 保持一致, 顺序即字体生成顺序) — 供导出前字码审计
  getExportIconCodeMeta = (): {
    id: string;
    iconName: string;
    iconCode: string;
    iconGroup: string;
  }[] => {
    dev && console.log('getExportIconCodeMeta');
    const rawData = this.db!.exec(
      `SELECT id, iconName, iconCode, iconGroup FROM ${iconData} WHERE iconGroup != 'resource-deleted' AND iconGroup != 'resource-recycleBin' AND variantOf IS NULL`
    );
    if (rawData.length === 0) return [];
    return rawData[0].values.map((row) => ({
      id: String(row[0]),
      iconName: String(row[1] ?? ''),
      iconCode: String(row[2] ?? ''),
      iconGroup: String(row[3] ?? ''),
    }));
  };
  // 导出集: 排除已删除与回收站 (回收站图标不应被导出进字体), 排除变体
  getIconList = (): Record<string, any>[] => {
    dev && console.log('getIconList');
    // 委托 core getIconListWithContent (SELECT * + WHERE 条件逐字相同, 含 iconContent)
    return this.coreDb!.getIconListWithContent() as unknown as Record<string, any>[];
  };
  // ── Metadata-only columns (excludes heavy iconContent/iconContentOriginal TEXT) ──
  // Used for grid listing — content loaded lazily per-icon when visible
  static ICON_META_COLS =
    'id, iconCode, iconName, iconGroup, iconSize, iconType, isFavorite, variantOf, createTime, updateTime';

  // 单次查询所有图标并按 group 分组（resource-all 视图用）— 仅元数据，不含 SVG 内容
  getAllIconsGrouped = (): Record<string, Record<string, any>[]> => {
    dev && console.log('getAllIconsGrouped');
    const p = (window as any).__BOBCORN_PERF__;
    p?.mark('db.getAllIconsGrouped');
    const rawData = this.db!.exec(
      `SELECT ${Database.ICON_META_COLS} FROM ${iconData} WHERE iconGroup != 'resource-deleted' AND iconGroup != 'resource-recycleBin' AND variantOf IS NULL`
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
    // 委托 core (core 无内容/无行时返回 null, 壳层保持既有 '' 回退契约)
    return this.coreDb!.getIconContent(id) || '';
  };

  /** Batch-load SVG content for multiple icons in a single query */
  getIconContentBatch = (ids: string[]): Map<string, string> => {
    if (ids.length === 0) return new Map();
    const placeholders = ids.map(() => '?').join(',');
    const result = this.db!.exec(
      `SELECT id, iconContent FROM ${iconData} WHERE id IN (${placeholders})`,
      ids
    );
    const map = new Map<string, string>();
    if (result.length > 0) {
      result[0].values.forEach((row: any[]) => {
        map.set(row[0] as string, row[1] as string);
      });
    }
    return map;
  };

  /** Batch-load icon metadata (no heavy content columns) in a single query.
   *  纯 UI 视图聚合 — BatchPanel 选中快照用: 框选拖曳中逐 id SELECT * 会造成
   *  O(N) 次含 SVG TEXT 的行读取, 这里一次 IN 查询只取元数据列 */
  getIconMetaBatch = (ids: string[]): Map<string, Record<string, any>> => {
    if (ids.length === 0) return new Map();
    const placeholders = ids.map(() => '?').join(',');
    const result = this.db!.exec(
      `SELECT ${Database.ICON_META_COLS} FROM ${iconData} WHERE id IN (${placeholders})`,
      ids
    );
    const map = new Map<string, Record<string, any>>();
    if (result.length > 0) {
      const cols = result[0].columns;
      result[0].values.forEach((row: any[]) => {
        const obj: Record<string, any> = {};
        row.forEach((val, i) => {
          obj[cols[i]] = val;
        });
        map.set(obj.id as string, obj);
      });
    }
    return map;
  };

  /** Lazy backfill: if iconContentOriginal is NULL, copy current iconContent into it.
   *  Called before any content mutation to preserve the pre-edit baseline. */
  ensureOriginalContent = (id: string): void => {
    const val = queryFirstValue(
      this.db!,
      `SELECT iconContentOriginal FROM ${iconData} WHERE id = ?`,
      [id]
    );
    // undefined = 行不存在（无需回填）；null = 行存在但原始内容从未保存过 → 回填
    if (val === null) {
      this.db!.run(`UPDATE ${iconData} SET iconContentOriginal = iconContent WHERE id = ${sf(id)}`);
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
        const rawData = this.db!.exec(`SELECT ${cols} FROM ${iconData} WHERE variantOf IS NULL`);
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
          `SELECT ${cols} FROM ${iconData} WHERE iconGroup = ${sf(targetGroup)} AND variantOf IS NULL`
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
        `SELECT ${cols} FROM ${iconData} WHERE iconGroup IN (${inClause}) AND variantOf IS NULL`
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
    // 委托 commands.moveIcons ('resource-all' 归一化一致; 无区间目标不改码)。
    // 语义统一: 原体只移父行不带变体, command 恒级联变体 — variant-guard 禁止组件直接
    // 调用本方法 (唯一豁免是 delIcon), 无真实调用方依赖不带变体语义, 故随 command 统一。
    commandMoveIcons(this.coreDb!, [id], targetGroup);
    // 写路径插桩 (dirty 标记) 留在壳层 — 时机与原 setDataOfTable 相同: 写后、callback 前
    this.notifyMutation();
    callback && callback();
  };
  duplicateIconGroup = (id: string, targetGroup: string, callback?: () => void): void => {
    dev && console.log('duplicateIconGroup');
    // 委托 commands.copyIcons (单 id): 新 UUID + 目标组区间内分配新码 (分配模式跟随设置),
    // 复制 iconName/iconSize/iconType/iconContent, iconContentOriginal 基线回退口径一致
    // (source.iconContentOriginal ?? source.iconContent)。
    const outcome = commandCopyIcons(this.coreDb!, [id], targetGroup, {
      codeMode: currentCodeMode(),
    });
    // 写路径插桩留在壳层; 原体失败时 (requireNewIconCode 抛) 无写入也无 notify — 保持一致
    if (outcome.copied > 0) this.notifyMutation();
    if (outcome.stopError) {
      // 原体经 requireNewIconCode 耗尽时抛裸 'PUA_EXHAUSTED' — 调用方 (SideEditor) 按
      // message 精确匹配, 壳层把 command 的带后缀 stopError 归一化后重抛;
      // GROUP_RANGE_EXHAUSTED 原样上抛 (原体亦带后缀, 调用方不匹配该消息)
      if (String(outcome.stopError.message).startsWith('PUA_EXHAUSTED')) {
        throw new Error('PUA_EXHAUSTED');
      }
      throw outcome.stopError;
    }
    callback && callback();
  };
  // ── Batch operations ─────────────────────────────────────────────
  moveIcons = (ids: string[], targetGroup: string, callback?: () => void): void => {
    dev && console.log('moveIcons');
    // 委托 commands.moveIcons ('resource-all' 归一化一致)。语义统一: 原体只移父行不带
    // 变体, command 恒级联 — variant-guard 禁止组件直接调用本方法, 无真实调用方依赖
    // 不带变体语义, 故随 command 统一 (同 moveIconGroup)。
    commandMoveIcons(this.coreDb!, ids, targetGroup);
    // 写路径插桩留在壳层 — 时机与原 runMutation 相同: 写后、callback 前
    this.notifyMutation();
    callback && callback();
  };

  /** Batch move icons AND their variants to a new group.
   *  opts.reassignOutOfRange (default false) reallocates out-of-range codes into the target group's range. */
  moveIconsWithVariants = (
    ids: string[],
    targetGroup: string,
    callback?: (reassignedCount?: number) => void,
    opts?: { reassignOutOfRange?: boolean }
  ): void => {
    dev && console.log('moveIconsWithVariants');
    // 委托 commands.moveIcons: 移动 (父+变体) + 可选越界重分配。目标组无区间或为
    // resource-* 虚拟组 (回收站/未分类) 时 outcome.reassigned 恒为空、不改码 —
    // 与原内联逻辑等价; 回收/恢复路径 (targetGroup = 'resource-recycleBin'/普通组) 同此。
    // 壳层职责: 分配模式跟随设置 codeAllocationMode。
    // 本批次因越界被重新分配字码的图标数 (含变体), 经 callback 回传给调用方拼装 toast。
    let reassignedCount = 0;
    try {
      const outcome = commandMoveIcons(this.coreDb!, ids, targetGroup, {
        reassignOutOfRange: opts?.reassignOutOfRange,
        codeMode: currentCodeMode(),
      });
      reassignedCount = outcome.reassigned.length;
    } finally {
      // 写路径插桩留在壳层。GROUP_RANGE_EXHAUSTED 上抛时移动已落库 (原体亦如此:
      // 移动的 runMutation 先于重分配抛错), dirty 标记必须补齐 — 故放 finally。
      this.notifyMutation();
    }
    callback && callback(reassignedCount);
  };
  delIcons = (ids: string[], callback?: () => void): void => {
    dev && console.log('delIcons');
    // 委托 commands.deleteIcons 'permanent' (父+变体硬删)。语义统一: 原体只删父行不含
    // 变体 — variant-guard 禁止组件直接调用本方法, 无真实调用方依赖不带变体语义。
    commandDeleteIcons(this.coreDb!, ids, 'permanent');
    // 写路径插桩留在壳层 — 时机与原 runMutation 相同: 写后、callback 前
    this.notifyMutation();
    callback && callback();
  };
  duplicateIcons = (
    ids: string[],
    targetGroup: string,
    callback?: (result?: { added: number; failed: number }) => void
  ): void => {
    dev && console.log('duplicateIcons');
    // 委托 commands.copyIcons: 码点耗尽即停, 剩余全部计 failed — partial failure 不抛
    // (与原体一致, stopError 壳层不消费); 返回形状适配为调用方读取的 { added, failed }。
    // 分配模式跟随设置; 'resource-all' 归一化与 iconContentOriginal 基线口径同 command。
    const outcome = commandCopyIcons(this.coreDb!, ids, targetGroup, {
      codeMode: currentCodeMode(),
    });
    // 写路径插桩留在壳层; 原体全部失败时 (首个分配即耗尽) 无写入也无 notify — 保持一致
    if (outcome.copied > 0) this.notifyMutation();
    callback && callback({ added: outcome.copied, failed: outcome.failed });
  };
  updateIconsColor = (ids: string[], targetColor: string, callback?: () => void): void => {
    dev && console.log('updateIconsColor');
    // 批量写入抑制逐条广播, 循环结束后一次性 emit 全部 ids
    this.suppressContentEmit = true;
    try {
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
    } finally {
      this.suppressContentEmit = false;
    }
    this.emitIconContentChanged(ids);
    callback && callback();
  };

  // ── Favorites ─────────────────────────────────────────────────────
  setIconFavorite = (id: string, isFavorite: number): void => {
    dev && console.log('setIconFavorite');
    this.runMutation(`UPDATE ${iconData} SET isFavorite = ? WHERE id = ?`, [isFavorite, id]);
  };

  setIconsFavorite = (ids: string[], isFavorite: number): void => {
    dev && console.log('setIconsFavorite');
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    this.runMutation(`UPDATE ${iconData} SET isFavorite = ? WHERE id IN (${placeholders})`, [
      isFavorite,
      ...ids,
    ]);
  };

  getFavoriteIcons = (): Record<string, any>[] => {
    dev && console.log('getFavoriteIcons');
    const rawData = this.db!.exec(
      `SELECT ${Database.ICON_META_COLS} FROM ${iconData} WHERE isFavorite = 1 AND iconGroup != 'resource-deleted' AND iconGroup != 'resource-recycleBin'`
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

  getFavoriteCount = (): number => {
    dev && console.log('getFavoriteCount');
    return queryFirstRow(
      this.db!,
      `SELECT COUNT(*) FROM ${iconData} WHERE isFavorite = 1 AND iconGroup != 'resource-deleted' AND iconGroup != 'resource-recycleBin'`
    )['COUNT(*)'] as number;
  };

  // ── Variant methods ─────────────────────────────────────────────────

  /** Add a variant icon linked to a parent. Throws if PUA codes exhausted. */
  addVariant = (
    parentId: string,
    svgContent: string,
    iconName: string,
    meta: Record<string, any>,
    callback?: () => void
  ): string => {
    dev && console.log('addVariant');
    const parentData = this.getIconData(parentId);
    // 变体沿用父图标分组; 若该组有区间, 变体码也落在区间内
    const newCode = this.getNewIconCode(undefined, parentData.iconGroup);
    if (!newCode) throw new Error('PUA_EXHAUSTED');
    const id = generateUUID();
    const dataSet: DataSet = {
      id: sf(id),
      iconCode: sf(newCode as string),
      iconName: sf(iconName),
      iconGroup: sf(parentData.iconGroup),
      iconSize: sizeOfString(svgContent),
      iconType: sf('svg'),
      iconContent: sf(svgContent),
      iconContentOriginal: sf(svgContent),
      variantOf: sf(parentId),
      variantMeta: sf(JSON.stringify(meta)),
    };
    this.addDataToTable(iconData, dataSet, callback);
    return id;
  };

  /** Get all variants of a parent icon */
  getVariants = (parentId: string): any[] => {
    // 委托 core (SELECT * ... ORDER BY iconName ASC, SQL 逐字相同)
    return this.coreDb!.getVariants(parentId);
  };

  /** Get count of variants for a parent icon */
  getVariantCount = (parentId: string): number => {
    // 委托 core (COUNT(*) WHERE variantOf, 语义相同)
    return this.coreDb!.getVariantCount(parentId);
  };

  /** Get ALL variant counts in one query. Returns Map<parentId, count>. */
  getAllVariantCounts = (): Map<string, number> => {
    const result = this.db!.exec(
      `SELECT variantOf, COUNT(*) as cnt FROM ${iconData} WHERE variantOf IS NOT NULL GROUP BY variantOf`
    );
    const map = new Map<string, number>();
    if (result.length > 0) {
      result[0].values.forEach((row: any[]) => {
        map.set(row[0] as string, row[1] as number);
      });
    }
    return map;
  };

  /** Check if a variant with given weight+scale already exists */
  hasVariant = (parentId: string, weight: string, scale: string): boolean => {
    const variants = this.getVariants(parentId);
    return variants.some((v: any) => {
      try {
        const meta = JSON.parse(v.variantMeta || '{}');
        return meta.weight === weight && meta.scale === scale;
      } catch {
        return false;
      }
    });
  };

  /** Delete all variants of a parent icon */
  deleteVariants = (parentId: string, callback?: () => void): void => {
    dev && console.log('deleteVariants');
    // 委托 coreDb 同名 (DELETE SQL 逐字相同; core 附带的 COUNT 返回值壳层不消费)
    this.coreDb!.deleteVariants(parentId);
    // 写路径插桩留在壳层 — 时机与原 runMutation 相同: 写后、callback 前
    this.notifyMutation();
    callback && callback();
  };

  /** Move parent icon AND its variants to a new group.
   *  opts.reassignOutOfRange (default false) reallocates out-of-range codes into the target group's range. */
  moveIconWithVariants = (
    id: string,
    targetGroup: string,
    callback?: (reassignedCount?: number) => void,
    opts?: { reassignOutOfRange?: boolean }
  ): void => {
    dev && console.log('moveIconWithVariants');
    // 委托 commands.moveIcons (单 id 包装) — 语义同 moveIconsWithVariants:
    // 移动 (父+变体) + 可选越界重分配; 无区间/resource-* 目标不改码 (回收/恢复路径同此);
    // 分配模式跟随设置。本次重分配数经 callback 回传给调用方拼装 toast。
    let reassignedCount = 0;
    try {
      const outcome = commandMoveIcons(this.coreDb!, [id], targetGroup, {
        reassignOutOfRange: opts?.reassignOutOfRange,
        codeMode: currentCodeMode(),
      });
      reassignedCount = outcome.reassigned.length;
    } finally {
      // 写路径插桩留在壳层。GROUP_RANGE_EXHAUSTED 上抛时移动已落库 (原体亦如此) — 故放 finally。
      this.notifyMutation();
    }
    callback && callback(reassignedCount);
  };

  /** Delete parent icon AND all its variants */
  deleteIconWithVariants = (id: string, callback?: () => void): void => {
    dev && console.log('deleteIconWithVariants');
    // 委托 commands.deleteIcons 'permanent' — DELETE 谓词同形 (id 或 variantOf 命中即硬删)。
    // 微差: command 先按 getIcon 过滤不存在的 id, 父行已缺失的孤儿变体不再顺带清除
    // (正常数据无此形态 — 所有删除路径均级联变体)。
    commandDeleteIcons(this.coreDb!, [id], 'permanent');
    // 写路径插桩留在壳层 — 时机与原 runMutation 相同: 写后、callback 前
    this.notifyMutation();
    callback && callback();
  };

  /** Check if an icon is a variant (has variantOf set) */
  isVariant = (id: string): boolean => {
    const result = this.db!.exec(`SELECT variantOf FROM ${iconData} WHERE id = ${sf(id)}`);
    return result.length > 0 && result[0].values.length > 0 && result[0].values[0][0] !== null;
  };

  renewIconData = (id: string, newIconFileData: RenewIconFileData, callback?: () => void): void => {
    dev && console.log('renewIconData');
    const { electronAPI } = window;
    // 文件读取是壳层职责 (command 不做 I/O)
    const content = electronAPI.readFileSync(newIconFileData.path, 'utf-8');
    // 委托 commands.replaceIconContent: iconContent + iconContentOriginal 基线重置 + 变体
    // 级联硬删 (原体不删变体, 由调用方 SideEditor 先行 deleteVariants — 命令收口后该步幂等)。
    commandReplaceIconContent(this.coreDb!, id, content);
    // command 未覆盖的列留壳层: id/iconCode/iconName/iconGroup/iconType, 且 iconSize 以
    // statSync 文件字节数为准 (覆盖 command 的 TextEncoder 字节长度口径, 与原体一致)。
    const dataSet: DataSet = {
      id: sf(newIconFileData.id),
      iconCode: sf(newIconFileData.iconCode),
      iconName: sf(newIconFileData.iconName),
      iconGroup: sf(newIconFileData.iconGroup),
      iconSize: electronAPI.statSync(newIconFileData.path).size,
      iconType: sf(typeOfFile(nameOfPath(newIconFileData.path))),
    };
    this.setIconData(id, dataSet, callback);
    // 原体 dataSet 含 iconContent → setIconData 在 callback 后 emit; 内容写入移入 command
    // 后 setIconData 不再触发, 壳层在同一时机补齐内容失效广播 (顺序: notify → callback → emit)
    this.emitIconContentChanged([id]);
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

// ── Stage C strangler 委托通道 (模块级导出, 0 缩进 — 不触 parity 冻结的类方法面) ──

/** 取单例 database 持有的 core ProjectDb 委托实例 (与遗留壳层共享同一 sql.js 连接)。
 *  供 core 操作层 (src/core/operations) 经 store 薄封装直接操作项目数据。 */
export function getCoreDb(): ProjectDb {
  if (!db.coreDb) throw new Error('DATABASE_NOT_INITIALIZED');
  return db.coreDb;
}

/** core 写路径绕过遗留类内写方法时, 由壳层调用补齐同款插桩:
 *  notifyMutation (dirty 标记) + 可选 emitIconContentChanged (画布内容缓存失效广播)。 */
export function notifyExternalMutation(contentChangedIds?: string[]): void {
  db.notifyExternalMutation(contentChangedIds);
}
