const dev: boolean = import.meta.env?.DEV ?? false;

// Utils
import { decToHex } from '../utils/tools';

// ── Types ─────────────────────────────────────────────────────────

export interface AppConfig {
  defaultSelectedGroup: string;
  acceptableIconTypes: string[];
  acceptableProjectTypes: string[];
  publicRangeUnicodeDecMin: number;
  publicRangeUnicodeHexMin: string;
  publicRangeUnicodeDecMax: number;
  publicRangeUnicodeHexMax: string;
  publicRangeUnicodeDecList: number[];
  publicRangeUnicodeHexList: string[];
}

export interface ExportFontSettings {
  // 'all' = 全选 (含未来新增分组),数组 = 显式选中的分组 ID 列表
  groupSelected: 'all' | string[];
  // 可选字体格式
  optionalFormats: { woff: boolean; eot: boolean };
  // 伴随文件
  companion: { css: boolean; js: boolean; html: boolean; icp: boolean };
  // 自动打包
  zip: boolean;
  // 上次选择的父目录;null 时回退桌面
  parentDir: string | null;
  // 用户自定义末级目录名;null 时用项目名
  customDirName: string | null;
}

export interface OptionData {
  iconBlockNameVisible: boolean;
  iconBlockCodeVisible: boolean;
  iconBlockSize: number;
  histProj: string[];
  sideMenuWidth: number;
  sideEditorWidth: number;
  darkMode: boolean;
  themeMode: 'light' | 'dark' | 'system';
  currentFilePath: string | null;
  // Update preferences
  autoCheckUpdate: boolean;
  autoDownloadUpdate: boolean;
  updateChannel: 'stable' | 'beta';
  // 导出字体设置 (用户级偏好,跨项目持久化)
  exportFontSettings: ExportFontSettings;
}

// 全局参数相关
const config: AppConfig = {
  // 默认选择的侧边菜单项
  defaultSelectedGroup: 'resource-all',
  // 可读取的图标文件格式
  acceptableIconTypes: ['image/svg+xml'],
  // 可读取的项目文件格式: json 为旧版项目, icp为本工具项目文件
  acceptableProjectTypes: ['json', 'icp'],
  // 可用的 Unicode 公用字码范围, 从 57344 到 63743 共 6399 个
  publicRangeUnicodeDecMin: 57344,
  publicRangeUnicodeHexMin: 'E000',
  publicRangeUnicodeDecMax: 63743,
  publicRangeUnicodeHexMax: 'F8FF',
  // 完整的 Unicode 可用字码范围表
  publicRangeUnicodeDecList: Array.from(new Array(6399), (_val, index) => index + 57344),
  publicRangeUnicodeHexList: Array.from(new Array(6399), (_val, index) => decToHex(index + 57344)),
};
export default config;

// 默认全局设置
const optionItem = 'option';
export const defOption: OptionData = {
  // 图标名称是否可见
  iconBlockNameVisible: true,
  // 图标字码是否可见
  iconBlockCodeVisible: true,
  // 图标区块默认大小
  iconBlockSize: 100,
  // 访问的历史项目文件路径记录
  histProj: [],
  // 面板宽度
  sideMenuWidth: 250,
  sideEditorWidth: 250,
  darkMode: false,
  themeMode: 'system',
  currentFilePath: null,
  // Update preferences
  autoCheckUpdate: true,
  autoDownloadUpdate: false,
  updateChannel: 'stable',
  // 导出字体设置默认值 — 与原 ExportDialog 默认勾选一致
  exportFontSettings: {
    groupSelected: 'all',
    optionalFormats: { woff: true, eot: true },
    companion: { css: true, js: true, html: true, icp: false },
    zip: false,
    parentDir: null,
    customDirName: null,
  },
};
// 重置设置
export const resetOption = (): void => {
  localStorage.removeItem(optionItem);
  localStorage.setItem(optionItem, JSON.stringify(defOption));
};
export const setOption = (userOptions: Partial<OptionData>): void => {
  localStorage.setItem(optionItem, JSON.stringify(Object.assign({}, getOption(), userOptions)));
};
export const getOption = (optionKey?: string): OptionData | OptionData[keyof OptionData] => {
  // 检测是否有配置项
  if (!(localStorage as any)[optionItem]) {
    resetOption();
  } else {
    // 合并缺失的新字段 (避免升级时重置用户配置)
    const stored = JSON.parse((localStorage as any)[optionItem]);
    if (Object.keys(defOption).length !== Object.keys(stored).length) {
      const merged = { ...defOption, ...stored };
      localStorage.setItem(optionItem, JSON.stringify(merged));
    }
  }
  // 返回配置
  const option: OptionData = JSON.parse((localStorage as any)[optionItem]);
  return optionKey && optionKey.constructor === String ? (option as any)[optionKey] : option;
};

// 路径设置
// 导出模板文件现在通过 Vite ?raw import 内联到 bundle 中
// 见 src/renderer/utils/generators/demopageGenerator/index.ts
