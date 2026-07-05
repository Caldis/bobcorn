import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Input } from '../ui';

// 图标字码前缀校验：字母开头，仅允许字母/数字/下划线/连字符
const PREFIX_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;

interface NewProjectDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (opts: { displayName: string; prefix: string }) => void;
}

/**
 * 创建项目对话框 — 拆分「项目名称」与「图标字码前缀」两个字段。
 * - 项目名称 (displayName)：可留空，UI 回退显示文件名
 * - 图标字码前缀 (prefix)：必填，用于字体名 / CSS 类名 / 导出目录
 */
function NewProjectDialog({ open, onClose, onConfirm }: NewProjectDialogProps) {
  const { t } = useTranslation();

  const [displayName, setDisplayName] = useState('');
  const [prefix, setPrefix] = useState('iconfont');

  // 对话框每次打开时重置为默认值
  useEffect(() => {
    if (open) {
      setDisplayName('');
      setPrefix('iconfont');
    }
  }, [open]);

  const prefixValid = useMemo(() => PREFIX_PATTERN.test(prefix.trim()), [prefix]);

  const handleConfirm = useCallback(() => {
    if (!prefixValid) return;
    onConfirm({ displayName: displayName.trim(), prefix: prefix.trim() });
  }, [prefixValid, displayName, prefix, onConfirm]);

  const footer = [
    <button
      key="cancel"
      onClick={onClose}
      className="px-4 py-1.5 rounded-md text-sm font-medium border border-border text-foreground hover:bg-surface-muted transition-colors"
    >
      {t('common.cancel')}
    </button>,
    <button
      key="ok"
      onClick={handleConfirm}
      disabled={!prefixValid}
      data-testid="new-project-confirm"
      className="px-4 py-1.5 rounded-md text-sm font-medium bg-accent text-accent-foreground hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {t('newProject.create')}
    </button>,
  ];

  return (
    <Dialog open={open} onClose={onClose} title={t('newProject.title')} footer={footer}>
      <div className="space-y-4">
        {/* 项目名称 */}
        <div>
          <label className="block t-label mb-1.5">{t('newProject.nameLabel')}</label>
          <Input
            autoFocus
            value={displayName}
            placeholder={t('newProject.namePlaceholder')}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDisplayName(e.target.value)}
            onPressEnter={prefixValid ? handleConfirm : undefined}
          />
          <p className="t-help mt-1">{t('newProject.nameHint')}</p>
        </div>

        {/* 图标字码前缀 */}
        <div>
          <label className="block t-label mb-1.5">{t('newProject.prefixLabel')}</label>
          <Input
            value={prefix}
            placeholder={t('newProject.prefixPlaceholder')}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPrefix(e.target.value)}
            onPressEnter={prefixValid ? handleConfirm : undefined}
          />
          {prefix.trim() !== '' && !prefixValid ? (
            <p className="t-help text-danger mt-1">{t('newProject.prefixInvalid')}</p>
          ) : (
            <p className="t-help mt-1">{t('newProject.prefixHint')}</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}

export default NewProjectDialog;
