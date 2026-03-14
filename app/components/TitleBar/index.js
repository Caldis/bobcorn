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

    componentWillMount() {
        // This function will be called once before component mount
    }
    componentDidMount() {
        // This function will be called once after component mount
    }
    componentWillReceiveProps(nextProps) {
        // This function will be called before receive new props
        // Will not run when component first mount
    }
    shouldComponentUpdate(nextProps, nextState) {
        // This function will be called before need to update
        // Will not run when component first mount
        // Component will not updated when it return 'false'
        return true;
    }
    componentWillUpdate(nextProps, nextState) {
        // This function will be called before need to update
        // You can't use 'this.setState()' in here
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