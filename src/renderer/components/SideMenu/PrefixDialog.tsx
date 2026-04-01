import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Alert, Button } from '../ui';
import { message } from '../ui/toast';
import { confirm } from '../ui/dialog';
import EnhanceInput from '../enhance/input';
import { isnContainSpace } from '../../utils/tools';
import db from '../../database';
import useAppStore from '../../store';
import i18n from '../../i18n';
import { supportedLanguages } from '../../../locales';

interface PrefixDialogProps {
  visible: boolean;
  onClose: () => void;
}

function PrefixDialog({ visible, onClose }: PrefixDialogProps) {
  const { t } = useTranslation();
  const syncLeft = useAppStore((state: any) => state.syncLeft);

  const [editingPrefixText, setEditingPrefixText] = useState<string | null>(null);
  const [editingPrefixErrText, setEditingPrefixErrText] = useState<string | null>(null);

  // Reset state when dialog opens
  const prevVisibleRef = React.useRef(false);
  if (visible && !prevVisibleRef.current) {
    setEditingPrefixText(db.getProjectName());
    setEditingPrefixErrText(null);
  }
  prevVisibleRef.current = visible;

  const handleEnsureEditPrefix = () => {
    if (isnContainSpace(editingPrefixText)) {
      confirm({
        title: t('prefix.confirmTitle'),
        content: t('prefix.confirmContent'),
        okText: t('prefix.confirmOk'),
        okType: 'danger',
        cancelText: t('common.cancel'),
        onOk() {
          db.setProjectName(editingPrefixText, () => {
            message.success(t('prefix.success'));
            syncLeft();
            onClose();
          });
        },
      });
    } else {
      setEditingPrefixErrText(t('prefix.emptyError'));
    }
  };

  const handleCancelEditPrefix = () => {
    onClose();
  };

  const onEditingPrefixChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditingPrefixText(e.target.value);
  };

  return (
    <Dialog
      open={visible}
      onClose={handleCancelEditPrefix}
      title={t('prefix.title')}
      footer={
        <>
          <Button onClick={handleCancelEditPrefix}>{t('common.cancel')}</Button>
          <Button type="primary" onClick={handleEnsureEditPrefix}>
            {t('prefix.confirmOk')}
          </Button>
        </>
      }
    >
      <div className="py-2">
        <Alert
          message={t('prefix.warningTitle')}
          description={
            <>
              <div>{t('prefix.warningLine1')}</div>
              <div>{t('prefix.warningLine2')}</div>
            </>
          }
          type="warning"
        />
        <div className="mt-4">
          <EnhanceInput
            placeholder={t('prefix.placeholder')}
            value={editingPrefixText}
            onChange={onEditingPrefixChange}
            onPressEnter={handleEnsureEditPrefix}
            inputTitle={t('prefix.inputTitle')}
            inputHintText={editingPrefixErrText}
            inputHintBadgeType="error"
          />
        </div>
      </div>

      {/* 分隔线 */}
      <div className="border-t border-border my-3" />

      {/* 语言设置 */}
      <div>
        <h4 className="text-xs font-semibold text-foreground-muted mb-2">
          {t('settings.language')}
        </h4>
        <select
          value={localStorage.getItem('language') === null ? '__system__' : i18n.language}
          onChange={(e) => {
            const val = e.target.value;
            if (val === '__system__') {
              localStorage.removeItem('language');
              const sysLng = navigator.language.startsWith('zh') ? 'zh-CN' : navigator.language;
              i18n.changeLanguage(sysLng);
              (window as any).electronAPI.languageChanged(sysLng);
            } else {
              localStorage.setItem('language', val);
              i18n.changeLanguage(val);
              (window as any).electronAPI.languageChanged(val);
            }
          }}
          className="w-full px-2 py-1.5 rounded-md border border-border bg-surface text-sm text-foreground focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400/30"
        >
          <option value="__system__">{t('settings.followSystem')}</option>
          {supportedLanguages.map((lng) => (
            <option key={lng.code} value={lng.code}>
              {lng.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-foreground-muted mt-1">{t('settings.languageDesc')}</p>
      </div>
    </Dialog>
  );
}

export default PrefixDialog;
