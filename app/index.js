// Antd (打包使用, 必须放在最前)
import 'antd/dist/antd.min.css';
// import './resources/iconfont/iconfont.css';
// Libs
import React from 'react';
import ReactDOM from 'react-dom';
import { AppContainer } from 'react-hot-loader';
// MainApp
import MainContainer from './containers/MainContainer';
// Styles (app.html 中也同时引入)
import './index.global.css';

ReactDOM.render(
    <AppContainer>
        <MainContainer/>
    </AppContainer>,
    document.getElementById('root')
);

if (module.hot) {
    module.hot.accept('./containers/MainContainer', () => {
        const NextMainContainer = require('./containers/MainContainer'); // eslint-disable-line global-require
        render(
            <AppContainer>
                <NextMainContainer/>
            </AppContainer>,
            document.getElementById('root')
        );
    });
}