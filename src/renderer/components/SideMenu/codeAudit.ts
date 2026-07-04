/**
 * 项目载入后字码审计
 *
 * .cp / .icp 项目文件导入完全绕过字码校验 (保留外部原始码), 重复/非法码
 * 会静默进入数据库并在字体导出时造成字形覆盖。策略为「保留原码并警告」:
 * 载入完成后审计一次, 发现问题弹警告引导用户到 项目设置 → 字码覆盖 处理。
 */
import i18next from 'i18next';
import { message } from '../ui/toast';
// eslint-disable-next-line no-restricted-imports -- TODO(core-migration): code.audit
import db from '../../database';
import { buildCoverageModel } from './codeCoverage';

export function warnIfProjectCodeIssues(): void {
  try {
    if (!(db as any)?.dbInited) return;
    const { summary } = buildCoverageModel((db as any).getAllIconCodes());
    const dup = summary.duplicateCodeCount;
    const invalid = summary.invalidCodeCount;
    if (dup > 0 && invalid > 0) {
      message.warning(i18next.t('import.codeAuditBoth', { dup, invalid }));
    } else if (dup > 0) {
      message.warning(i18next.t('import.codeAuditDup', { dup }));
    } else if (invalid > 0) {
      message.warning(i18next.t('import.codeAuditInvalid', { invalid }));
    }
  } catch {
    /* 审计失败不阻断载入 */
  }
}
