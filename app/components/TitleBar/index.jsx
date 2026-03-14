// Lib
import React from 'react';
// Styles
import styles from './index.module.css';
// electron-react-titlebar
import { TitleBar } from 'electron-react-titlebar';

function TopBar() {
    return (
        <TitleBar menu={[
            {
                label: 'Edit',
                submenu: [
                    {role: 'undo'},
                    {role: 'redo'},
                    {type: 'separator'},
                    {role: 'cut'},
                    {role: 'copy'},
                    {role: 'paste'},
                    {role: 'pasteandmatchstyle'},
                    {role: 'delete'},
                    {role: 'selectall'}
                ]
            }]}/>
    );
}

export default TitleBar;
