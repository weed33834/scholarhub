/**
 * i18n 入口（0.2.0 第一阶段：基础设施 + auth 集群四页迁移）。
 *
 * - 默认 zh-CN：与历史硬编码文案逐字一致，保证既有 E2E（依赖中文
 *   选择器）不受影响；en 资源为同 key 英文翻译。
 * - 语言持久化在 localStorage('scholarhub-lang')；切换后整页刷新，
 *   让 document.lang 等非 React 文案一并生效。
 * - 命名空间按域拆分（common / auth）。catalog 等后续页面迁移时
 *   再加入对应 namespace，不要把所有 key 堆进 common。
 */
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

import authEn from './locales/en/auth.json'
import commonEn from './locales/en/common.json'
import authZh from './locales/zh-CN/auth.json'
import commonZh from './locales/zh-CN/common.json'

export const SUPPORTED_LANGS = ['zh-CN', 'en'] as const
export type SupportedLang = (typeof SUPPORTED_LANGS)[number]

const LANG_KEY = 'scholarhub-lang'

export function getInitialLang(): SupportedLang {
  const stored =
    typeof window !== 'undefined' ? window.localStorage.getItem(LANG_KEY) : null
  return stored === 'en' ? 'en' : 'zh-CN'
}

export function changeLang(lang: SupportedLang): void {
  window.localStorage.setItem(LANG_KEY, lang)
  // 整页刷新：最简单可靠地同步 <html lang> 与浏览器标题
  window.location.reload()
}

void i18next.use(initReactI18next).init({
  lng: getInitialLang(),
  fallbackLng: 'zh-CN',
  defaultNS: 'common',
  ns: ['common', 'auth'],
  resources: {
    'zh-CN': { common: commonZh, auth: authZh },
    en: { common: commonEn, auth: authEn },
  },
  interpolation: { escapeValue: false },
})

export default i18next
