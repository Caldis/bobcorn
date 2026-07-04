// 根据字码分配结果 (v1.13 append/fill 分配模式) 构造导入成功提示文案
// 供 IconGridLocal (拖拽导入) 与 SideMenu (菜单导入) 复用, 保持两处 toast 文案表现一致

/** db.addIcons 回调结果中与字码分配性质相关的字段 (其余字段如 added/failed 与本文案构造无关) */
export interface ImportAllocationResult {
  appended?: number;
  filled?: number;
}

/** 与 react-i18next 的 t() 兼容的最小签名, 避免本模块直接依赖 react-i18next 类型 */
type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

// 全部追加至字码末尾 → successAppended; 全部填充空闲孔洞 → successFilled; 两者皆有 → successMixed
// result 缺失或 appended/filled 均为 0 (如 count 为 0 或调用方未提供统计) 时兜底为 successAppended
export const buildImportSuccessMessage = (
  t: TranslateFn,
  result: ImportAllocationResult | undefined,
  count: number
): string => {
  const appended = result?.appended ?? 0;
  const filled = result?.filled ?? 0;
  if (appended > 0 && filled > 0) {
    return t('import.successMixed', { count, appended, filled });
  }
  if (filled > 0) {
    return t('import.successFilled', { count });
  }
  return t('import.successAppended', { count });
};
