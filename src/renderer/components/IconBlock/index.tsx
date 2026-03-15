// React
import React, { useRef, useEffect } from 'react';
// Style
import style from './index.module.css';
// antd
import { Checkbox } from 'antd';
import { sanitizeSVG } from '../../utils/sanitize';

interface IconData {
  id: string;
  [key: string]: any;
}

interface IconBlockProps {
  selected?: boolean;
  checked?: boolean;
  data?: IconData;
  name?: string;
  code?: string;
  content?: string;
  width?: number | string;
  nameVisible?: boolean;
  codeVisible?: boolean;
  handleIconSelected?: (id: string, data: IconData) => void;
}

function IconBlock({
  selected = false,
  checked,
  data = {} as IconData,
  name = '',
  code,
  content = '',
  width = 'auto',
  nameVisible = true,
  codeVisible = true,
  handleIconSelected,
}: IconBlockProps) {
  const iconBlockRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const selfDOM = iconBlockRef.current;
    if (selfDOM) {
      selfDOM.style.width = selfDOM.clientWidth + 'px';
    }
  }, []);

  const handleSelected = () => {
    handleIconSelected?.(data.id, data);
  };

  return (
    <div
      className={selected ? style.iconBlockContainerSelected : style.iconBlockContainer}
      onClick={handleSelected}
    >
      {checked !== undefined && <Checkbox className={style.iconBlockCheckBox} checked={checked} />}
      <div className={style.iconContentContainer} style={{ width: width }} ref={iconBlockRef}>
        <div
          className={style.iconContentWrapper}
          dangerouslySetInnerHTML={{ __html: sanitizeSVG(content) }}
        />
      </div>
      <div className={style.iconNameContainer} style={{ width: width }}>
        <p className={style.iconName} style={{ height: nameVisible ? 18 : 0 }}>
          {name}
        </p>
        <p className={style.iconCode} style={{ height: codeVisible ? 18 : 0 }}>
          {code}
        </p>
      </div>
    </div>
  );
}

export default IconBlock;
