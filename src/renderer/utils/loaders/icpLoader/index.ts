// Database
// eslint-disable-next-line no-restricted-imports -- TODO(core-migration): project.open-file
import db from '../../../database';

// 默认名称
const icpLoader = (data: Uint8Array | string, callback?: () => void): void => {
  if (data.length > 0) {
    const p = (window as any).__BOBCORN_PERF__;
    p?.mark('icpLoader.initProject');
    db.initNewProjectFromData(data);
    p?.measure('icpLoader.initProject');
    callback && callback();
  }
};

export default icpLoader;
