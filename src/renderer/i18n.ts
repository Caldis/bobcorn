import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources } from '../locales';

const savedLng = localStorage.getItem('language');

i18n.use(initReactI18next).init({
  resources,
  lng: savedLng || undefined,
  fallbackLng: 'zh-CN',
  interpolation: { escapeValue: false },
});

export default i18n;
