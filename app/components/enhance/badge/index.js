// React
import React from 'react';
import PropTypes from 'prop-types';
// Antd
import { Badge } from 'antd';
// Style
import style from './index.css';

class EnhanceBadge extends React.Component{
    constructor(props) {
        super(props);
    }

    render() {
        const { status, text } = this.props;
        return (
            <div className={style.enhanceBadge} style={{ height: text ? 28 : 0}}>
                <Badge status={status} text={text}/>
            </div>
        );
    }
}

// https://facebook.github.io/react/docs/typechecking-with-proptypes.html
// Prop Types
EnhanceBadge.propTypes = {
    // 提示状态
    status: PropTypes.string,
    // 提示文字
    text: PropTypes.string,
};
// Default Props
EnhanceBadge.defaultProps = {
    status: "success",
    text: "",
};

export default EnhanceBadge;