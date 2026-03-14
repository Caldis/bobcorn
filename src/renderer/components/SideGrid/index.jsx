// React
import React from 'react';
// Components
import IconInfoBar from '../IconInfoBar';
import IconGridLocal from '../IconGridLocal';
// Style
import style from './index.module.css';

function SideGrid({ selectedSource, ...props }) {
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
