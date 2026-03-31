// React
import React from 'react';
// Components
import IconInfoBar from '../IconInfoBar';
import IconGridLocal from '../IconGridLocal';
// Utils
import { cn } from '../../lib/utils';

interface SideGridProps {
  selectedGroup: string;
  selectedSource: string;
  selectedIcon: string | null;
  handleGroupSelected?: (group: string) => void;
  handleIconSelected: (id: string | null, data?: any) => void;
  handleSourceSelected: (source: string) => void;
}

const SideGrid = React.memo(function SideGrid({ selectedSource, ...props }: SideGridProps) {
  return (
    <div className={cn('w-full h-full flex flex-col', 'border-l border-border')}>
      {/*顶部信息栏*/}
      <div>
        <IconInfoBar selectedSource={selectedSource} {...props} />
      </div>

      {/*主体内容*/}
      <div
        className={cn(
          'flex-grow flex flex-row overflow-hidden',
          'transition-transform duration-300'
        )}
        style={{ transform: `translateX(${selectedSource === 'local' ? '0%' : '-100%'})` }}
      >
        <div className="w-full flex flex-grow shrink-0">
          <IconGridLocal {...props} />
        </div>
      </div>
    </div>
  );
});

export default SideGrid;
