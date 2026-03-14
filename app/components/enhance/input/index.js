// React
import React from 'react';
import PropTypes from 'prop-types';
// Antd
import { Input, Button } from 'antd';
// Components
import EnhanceBadge from '../badge';
// Style
import style from './index.module.css';

class EnhanceInput extends React.Component{
    constructor(props) {
        super(props);

        this.ref = {
            input: React.createRef()
        }
    }

    componentDidUpdate() {
        if (this.props.autoFocus && this.ref.input) {
            this.ref.input.current.focus()
        }
    }

    render() {
        const { inputTitle, inputHintText, inputHintBadgeType, inputSave, inputSaveClick, ...inputProps } = this.props;
        return (
            <div className={style.enhanceInputContainer}>
                <p className={style.inputTitle}>{inputTitle}</p>
                <div className={style.inputGroup}>
                    <Input ref={this.ref.input} {...inputProps}/>
                    { inputSave && <Button className={style.inputSave} shape="circle" icon="save" onClick={inputSaveClick}/> }
                </div>
                <EnhanceBadge status={inputHintBadgeType} text={inputHintText}/>
            </div>
        );
    }
}

// https://facebook.github.io/react/docs/typechecking-with-proptypes.html
// Prop Types
EnhanceInput.propTypes = {
    // 自动聚焦
    autoFocus: PropTypes.bool,
    // 输入框标题
    inputTitle: PropTypes.string,
    // 输入框外部提示徽标类型
    inputHintBadgeType: PropTypes.string,
    // 输入框外部提示文字
    inputHintText: PropTypes.string,
    // 输入框内的保存按钮
    inputSave: PropTypes.bool,
    // 输入框内的保存按钮点击
    inputSaveClick: PropTypes.func
};
// Default Props
EnhanceInput.defaultProps = {
    // 自动聚焦
    autoFocus: true,
    // 输入框标题
    inputTitle: "",
    // 输入框外部提示徽标类型: success, error, default, processing, warning
    inputHintBadgeType: "error",
    // 输入框外部提示文字
    inputHintText: "",
    // 输入框内的保存按钮
    inputSave: false,
    // 输入框内的保存按钮点击
    inputSaveClick: ()=>{}
};

export default EnhanceInput;