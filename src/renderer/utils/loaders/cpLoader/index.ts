// Database
// eslint-disable-next-line no-restricted-imports -- TODO(core-migration): project.open-file
import db from '../../../database';
// Store
import useAppStore from '../../../store';

interface CpGroupData {
  name: string;
  listData: any;
}

interface CpLoaderOption {
  data: CpGroupData[];
  db?: typeof db;
}

// 默认名称
// option = {
//     data // 必须, 基本数据
//     db // 如果传入, 则数据将会 load 到指定的 db 中, 否则load到全局的db中
// }
const cpLoader = (option: CpLoaderOption, callback?: () => void): void => {
  const _db = option.db || db;
  if (option.data.length > 0) {
    _db.resetProject();
    // 换库后旧项目的内容缓存必须清空（仅全局 db；传入自定义 db 时不影响画布）
    if (!option.db) useAppStore.getState().resetIconContentCaches();
    option.data.forEach((group) => {
      const groupName = group.name;
      const groupData = group.listData;
      _db.addGroup(groupName, (addedGroupData: { id: string }) => {
        _db.addIconsFromCpData(groupData, addedGroupData.id);
      });
    });
    callback && callback();
  }
};

export default cpLoader;
