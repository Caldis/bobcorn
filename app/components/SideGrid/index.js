// React
import React from 'react';
import PropTypes from 'prop-types';
// Components
import IconInfoBar from '../iconInfoBar';
import IconGridLocal from '../iconGridLocal';
// import IconGridCloud from '../iconGridCloud';
// Style
import style from './index.module.css';

class SideGrid extends React.Component{
    constructor(props) {
        super(props);
    }

    render() {
        const { selectedSource, ...props } = this.props;
        return (
            <div className={style.iconContainZone}>

                {/*顶部信息栏*/}
                <div className={style.iconInfoOuterContainer}>
                    <IconInfoBar selectedSource={selectedSource} { ...props }/>
                </div>

                {/*主体内容*/}
                <div
	                className={style.iconGridOuterContainer}
	                style={{ transform: `translateX(${selectedSource==="local" ? "0%" : "-100%"})`}}
                >
                    <div className={style.iconGridOuterWrapper}>
                        <IconGridLocal {...props}/>
                    </div>
                    {/*<div className={style.iconGridOuterWrapper}>*/}
                        {/*<IconGridCloud {...props}/>*/}
                    {/*</div>*/}
                </div>

            </div>
        );
    }
}

export default SideGrid;