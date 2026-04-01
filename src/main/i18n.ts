import i18n from 'i18next';
import { app } from 'electron';
import { resources } from '../locales';

const mainI18n = i18n.createInstance();
mainI18n.init({
  resources,
  lng: app.getLocale().startsWith('zh') ? 'zh-CN' : app.getLocale(),
  fallbackLng: 'zh-CN',
  interpolation: { escapeValue: false },
});

export default mainI18n;
