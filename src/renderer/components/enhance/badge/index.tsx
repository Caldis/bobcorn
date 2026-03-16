// React
import React from 'react';
// UI
import { Badge } from '../../ui';
// Utils
import { cn } from '../../../lib/utils';

interface EnhanceBadgeProps {
  status?: 'success' | 'processing' | 'default' | 'error' | 'warning';
  text?: string | null;
}

function EnhanceBadge({ status = 'success', text = '' }: EnhanceBadgeProps) {
  return (
    <div
      className={cn(
        'overflow-hidden flex items-center',
        'pl-1',
        'transition-[height] duration-200'
      )}
      style={{ height: text ? 28 : 0 }}
    >
      <Badge status={status} text={text || undefined} />
    </div>
  );
}

export default EnhanceBadge;
