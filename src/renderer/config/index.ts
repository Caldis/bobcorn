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

export interface OptionData {
  iconBlockNameVisible: boolean;
  iconBlockCodeVisible: boolean;
  iconBlockSize: number;
  histProj: string[];
  sideMenuWidth: number;
  sideEditorWidth: number;
  darkMode: boolean;
  currentFilePath: string | null;
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
  currentFilePath: null,
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
  !(localStorage as any)[optionItem] && resetOption();
  // 检测配置项是否完整
  Object.keys(defOption).length !==
    Object.keys(JSON.parse((localStorage as any)[optionItem])).length && resetOption();
  // 返回配置
  const option: OptionData = JSON.parse((localStorage as any)[optionItem]);
  return optionKey && optionKey.constructor === String ? (option as any)[optionKey] : option;
};

// 路径设置
// 导出模板文件现在通过 Vite ?raw import 内联到 bundle 中
// 见 src/renderer/utils/generators/demopageGenerator/index.ts
