// Antd
import { message } from 'antd';
// Utils
import { nameOfPath, typeOfFile } from '../../../utils/tools';

// 读取项目文件数据
const projFileLoader = (path) => {
    const { electronAPI } = window;
    const fileType = typeOfFile(nameOfPath(path)).toLowerCase();
    // 如果为 json 文件, 可能是cp文件, 需要进一步校验
    if (fileType === "json") {
        // cp文件
        try {
            const projectData = JSON.parse(electronAPI.readFileSync(path, 'utf-8'));
            if (Object.keys(projectData[projectData.length - 1]["optData"]).length > 0) {
                return {
                    type: "cp",
                    data: projectData
                };
            }
        } catch (err) {
            message.error(`项目文件解析错误: ${err}`);
            return false;
        }
    } else if (fileType === "icp") {
        // icp文件
        try {
            const projectData = electronAPI.readFileSync(path);
            if (projectData) {
                return {
                    type: "icp",
                    data: projectData
                };
            }
        } catch (err) {
            message.error(`项目文件解析错误: ${err}`);
            return false;
        }
    } else {
        message.error(`项目文件解析错误`);
        return false;
    }
};

export default projFileLoader;