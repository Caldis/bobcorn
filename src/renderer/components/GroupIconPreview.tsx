import React, { useMemo } from 'react';
import { sanitizeSVG } from '../utils/sanitize';
// eslint-disable-next-line no-restricted-imports -- TODO(core-migration): icon.get-content
import db from '../database';
import { cn } from '../lib/utils';

/**
 * Renders a group's custom icon (SVG) at the given size.
 * Returns null if no groupIcon is set.
 */
function GroupIconPreview({
  iconId,
  className,
}: {
  iconId: string | undefined | null;
  className?: string;
}) {
  const html = useMemo(() => {
    if (!iconId) return '';
    return sanitizeSVG(db.getIconContent(iconId));
  }, [iconId]);

  if (!iconId || !html) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center shrink-0 [&>svg]:w-full [&>svg]:h-full',
        className
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default React.memo(GroupIconPreview);
