// React
import React from 'react';
// Components
import IconInfoBar from '../IconInfoBar';
import IconGridLocal from '../IconGridLocal';
// Style
import style from './index.module.css';

interface SideGridProps {
  selectedGroup: string;
  selectedSource: string;
  selectedIcon: string | null;
  handleGroupSelected?: (group: string) => void;
  handleIconSelected: (id: string | null, data?: any) => void;
  handleSourceSelected: (source: string) => void;
}

function SideGrid({ selectedSource, ...props }: SideGridProps) {
  return (
    <div className={style.iconContainZone}>
      {/*顶部信息栏*/}
      <div className={style.iconInfoOuterContainer}>
        <IconInfoBar selectedSource={selectedSource} {...props} />
      </div>

      {/*主体内容*/}
      <div
        className={style.iconGridOuterContainer}
        style={{ transform: `translateX(${selectedSource === 'local' ? '0%' : '-100%'})` }}
      >
        <div className={style.iconGridOuterWrapper}>
          <IconGridLocal {...props} />
        </div>
      </div>
    </div>
  );
}

export default SideGrid;
