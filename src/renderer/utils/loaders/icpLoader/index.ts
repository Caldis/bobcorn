// Database
// eslint-disable-next-line no-restricted-imports -- TODO(core-migration): project.open-file
import db from '../../../database';
// Store
import useAppStore from '../../../store';

// 默认名称
const icpLoader = (data: Uint8Array | string, callback?: () => void): void => {
  if (data.length > 0) {
    const p = (window as any).__BOBCORN_PERF__;
    p?.mark('icpLoader.initProject');
    db.initNewProjectFromData(data);
    // 换库后旧项目的内容缓存必须清空，防止同 id 图标（复制的 .icp）画布串内容
    useAppStore.getState().resetIconContentCaches();
    p?.measure('icpLoader.initProject');
    callback && callback();
  }
};

export default icpLoader;
