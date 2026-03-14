// React
import React, { useRef, useEffect } from 'react';
// Style
import style from './index.module.css';
// antd
import { Checkbox } from 'antd';
import { sanitizeSVG } from '../../utils/sanitize';

function IconBlock({ selected = false, checked, data = {}, name = "", code, content = "", width = "auto", nameVisible = true, codeVisible = true, handleIconSelected }) {
    const iconBlockRef = useRef(null);

    useEffect(() => {
        const selfDOM = iconBlockRef.current;
        if (selfDOM) {
            selfDOM.style.width = selfDOM.clientWidth + "px";
        }
    }, []);

    const handleSelected = () => {
        console.log(data);
        handleIconSelected(data.id, data);
    };

    return (
        <div className={selected ? style.iconBlockContainerSelected : style.iconBlockContainer} onClick={handleSelected}>
            { checked!==undefined && <Checkbox className={style.iconBlockCheckBox} checked={checked}/> }
            <div className={style.iconContentContainer} style={{ width: width }} ref={iconBlockRef}>
                <div className={style.iconContentWrapper} dangerouslySetInnerHTML={{__html: sanitizeSVG(content)}} />
            </div>
            <div className={style.iconNameContainer} style={{ width: width }}>
                <p className={style.iconName} style={{ height: nameVisible?18:0 }}>{name}</p>
                <p className={style.iconCode} style={{ height: codeVisible?18:0 }}>{code}</p>
            </div>
        </div>
    );
}

export default IconBlock;
