import zhCN from './zh-CN.json';
import en from './en.json';

export const resources = {
  'zh-CN': { translation: zhCN },
  en: { translation: en },
};

export const supportedLanguages = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'en', label: 'English' },
];
