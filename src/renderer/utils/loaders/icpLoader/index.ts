// Database
import db from '../../../database';

// 默认名称
const icpLoader = (data: Uint8Array | string, callback?: () => void): void => {
  if (data.length > 0) {
    db.initNewProjectFromData(data);
    callback && callback();
  }
};

export default icpLoader;
