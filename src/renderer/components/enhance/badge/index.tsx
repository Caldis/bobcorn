// React
import React from 'react';
// Antd
import { Badge } from 'antd';
// Style
import style from './index.module.css';

interface EnhanceBadgeProps {
  status?: 'success' | 'processing' | 'default' | 'error' | 'warning';
  text?: string | null;
}

function EnhanceBadge({ status = "success", text = "" }: EnhanceBadgeProps) {
    return (
        <div className={style.enhanceBadge} style={{ height: text ? 28 : 0}}>
            <Badge status={status} text={text || undefined}/>
        </div>
    );
}

export default EnhanceBadge;
