// React
import React from 'react';
// Antd
import { Badge } from 'antd';
// Style
import style from './index.module.css';

function EnhanceBadge({ status = "success", text = "" }) {
    return (
        <div className={style.enhanceBadge} style={{ height: text ? 28 : 0}}>
            <Badge status={status} text={text}/>
        </div>
    );
}

export default EnhanceBadge;
