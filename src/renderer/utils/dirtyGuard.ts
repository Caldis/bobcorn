import useAppStore from '../store';
import { confirm } from '../components/ui/dialog';
import i18n from '../i18n';

/**
 * Check if the project has unsaved changes. If dirty, prompt the user with a
 * three-way choice before proceeding:
 *   - Cancel        → stay on the current project (resolve false)
 *   - {action} anyway → discard changes and continue without saving (resolve true)
 *   - Save & {action} → save the current project first, then continue
 *
 * The verb (`action`) is a localized string (e.g. t('dirtyGuard.actionOpen'))
 * so the buttons read "Save & Open" / "Open anyway" etc.
 *
 * Returns true when it is safe to continue:
 *   - not dirty                     → true (no dialog shown)
 *   - user picks "{action} anyway"  → true (changes discarded)
 *   - user picks "Save & {action}"  → true only if the save actually completed
 *     (if the native Save-As dialog is cancelled, the project stays dirty and
 *     we resolve false so the caller aborts)
 *   - save throws / user cancels    → false
 */
export async function guardDirtyState(opts: {
  saveHandler: () => Promise<void>;
  /** Localized action verb, e.g. t('dirtyGuard.actionOpen') */
  action: string;
  title?: string;
  content?: string;
}): Promise<boolean> {
  const { isDirty } = useAppStore.getState();
  if (!isDirty) return true;

  const t = i18n.t.bind(i18n);
  return new Promise<boolean>((resolve) => {
    confirm({
      title: opts.title ?? t('dirtyGuard.title'),
      content: opts.content ?? t('dirtyGuard.content'),
      // Primary (blue): save then continue
      okText: t('dirtyGuard.saveAnd', { action: opts.action }),
      okType: 'primary',
      // Danger (red): discard and continue
      dangerText: t('dirtyGuard.discardAnd', { action: opts.action }),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await opts.saveHandler();
          // Success is measured by markClean(): if the Save-As dialog was
          // cancelled the project is still dirty → treat as "stay in place".
          resolve(!useAppStore.getState().isDirty);
        } catch {
          resolve(false);
        }
      },
      onDanger: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}
