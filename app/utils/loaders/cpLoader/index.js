// Database
import db from '../../../database';

// 默认名称
// option = {
//     data // 必须, 基本数据
//     db // 如果传入, 则数据将会 load 到指定的 db 中, 否则load到全局的db中
// }
const cpLoader = (option = {}, callback) => {
    const _db = option.db || db;
    if (option.data.length>0) {
        _db.resetProject();
	    option.data.forEach(group => {
            const groupName = group.name;
            const groupData = group.listData;
            _db.addGroup(groupName, (addedGroupData) => {
                _db.addIconsFromCpData(groupData, addedGroupData.id);
            });
        });
        callback && callback();
    }
};

export default cpLoader;