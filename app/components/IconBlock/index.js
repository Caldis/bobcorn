// React
import React from 'react';
import PropTypes from 'prop-types';
// Style
import style from './index.module.css';
// antd
import { Checkbox } from 'antd';
import { sanitizeSVG } from '../../utils/sanitize';

class IconBlock extends React.Component{
    constructor(props) {
        super(props);
        this.ref = {
            iconBlock: React.createRef()
        }
    }

    // https://facebook.github.io/react/docs/state-and-lifecycle.html
    // On React IconGrid Mounting
    componentDidMount() {
        // Is called after Render
        const selfDOM = this.ref.iconBlock.current;
        selfDOM.style.width = selfDOM.clientWidth + "px";
    }

    handleSelected = (e) => {
        console.log(this.props.data)
        this.props.handleIconSelected(this.props.data.id, this.props.data);
    };

    render() {
        const { selected, checked } = this.props;
        return (
            <div className={selected ? style.iconBlockContainerSelected : style.iconBlockContainer} onClick={this.handleSelected}>
	            { checked!==undefined &&<Checkbox className={style.iconBlockCheckBox} checked={checked}/> }
                <div className={style.iconContentContainer} style={{ width: this.props.width }} ref={this.ref.iconBlock}>
                    <div className={style.iconContentWrapper} dangerouslySetInnerHTML={{__html: sanitizeSVG(this.props.content)}} />
                </div>
                <div className={style.iconNameContainer} style={{ width: this.props.width }}>
                    <p className={style.iconName} style={{ height: this.props.nameVisible?18:0 }}>{this.props.name}</p>
                    <p className={style.iconCode} style={{ height: this.props.codeVisible?18:0 }}>{this.props.code}</p>
                </div>
            </div>
        );
    }
}

// https://facebook.github.io/react/docs/typechecking-with-proptypes.html
// Prop Types
IconBlock.propTypes = {
    selected: PropTypes.bool,
    data: PropTypes.object,
    name: PropTypes.string,
    content: PropTypes.string,
    width: PropTypes.number,
    nameVisible: PropTypes.bool,
    codeVisible: PropTypes.bool
};
// Default Props
IconBlock.defaultProps = {
    selected: false,
    data: {},
    name: "",
    content: "",
    width: "auto",
    nameVisible: true,
    codeVisible: true
};

export default IconBlock;