// React
import React, { useRef, useEffect } from 'react';
// Antd
import { Input, Button } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
// Components
import EnhanceBadge from '../badge';
// Style
import style from './index.module.css';

function EnhanceInput({
    autoFocus = true,
    inputTitle = "",
    inputHintBadgeType = "error",
    inputHintText = "",
    inputSave = false,
    inputSaveClick = () => {},
    ...inputProps
}) {
    const inputRef = useRef(null);

    useEffect(() => {
        if (autoFocus && inputRef.current) {
            inputRef.current.focus();
        }
    });

    return (
        <div className={style.enhanceInputContainer}>
            <p className={style.inputTitle}>{inputTitle}</p>
            <div className={style.inputGroup}>
                <Input ref={inputRef} {...inputProps}/>
                { inputSave && <Button className={style.inputSave} shape="circle" icon={<SaveOutlined />} onClick={inputSaveClick}/> }
            </div>
            <EnhanceBadge status={inputHintBadgeType} text={inputHintText}/>
        </div>
    );
}

export default EnhanceInput;
