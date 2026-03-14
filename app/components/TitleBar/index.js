// Lib
import React from 'react';
// Styles
import styles from './index.module.css';
// electron-react-titlebar
import { TitleBar } from 'electron-react-titlebar';


class TopBar extends React.Component{
    constructor(props) {
        super(props);
    }

    componentDidMount() {
        // This function will be called once after component mount
    }
    componentDidUpdate(prevProps, prevState) {
        // This function will be called after component updated
    }
    componentWillUnmount() {
        // This function will be called before component unmount
        // Clean useless timer or listener in here
    }

    render() {
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
        )
    }
}

export default TitleBar;