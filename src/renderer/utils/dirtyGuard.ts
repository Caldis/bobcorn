import useAppStore from '../store';
import { confirm } from '../components/ui/dialog';
import i18n from '../i18n';

/**
 * Check if the project has unsaved changes. If dirty, prompt the user
 * to save before proceeding. Returns true if safe to continue.
 */
export async function guardDirtyState(opts: {
  saveHandler: () => Promise<void>;
  title?: string;
  content?: string;
  okText?: string;
}): Promise<boolean> {
  const { isDirty } = useAppStore.getState();
  if (!isDirty) return true;

  const t = i18n.t.bind(i18n);
  return new Promise<boolean>((resolve) => {
    confirm({
      title: opts.title ?? t('update.unsavedTitle'),
      content: opts.content ?? t('update.unsavedContent'),
      okText: opts.okText ?? t('update.saveAndUpdate'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await opts.saveHandler();
          resolve(true);
        } catch {
          resolve(false);
        }
      },
      onCancel: () => resolve(false),
    });
  });
}
