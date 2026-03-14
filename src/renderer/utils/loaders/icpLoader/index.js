// Database
import db from '../../../database';

// 默认名称
const icpLoader = (data, callback, exDb) => {
	const _db = exDb || db;
	if (data.length>0) {
		db.initNewProjectFromData(data);
		callback && callback();
	}
};

export default icpLoader;