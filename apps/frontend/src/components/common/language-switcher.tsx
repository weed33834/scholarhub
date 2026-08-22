import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { changeLang, getInitialLang, SUPPORTED_LANGS } from '@/i18n'

/**
 * 语言切换器（访客可达的 auth 页面右上角）。
 * fixed 定位，不依赖父容器；当前语言以 secondary 变体高亮。
 */
export function LanguageSwitcher() {
  const { t } = useTranslation('common')
  const current = getInitialLang()

  return (
    <div
      className="fixed right-4 top-4 z-50 flex gap-1"
      role="group"
      aria-label={t('lang.label')}
    >
      {SUPPORTED_LANGS.map((lang) => (
        <Button
          key={lang}
          variant={lang === current ? 'secondary' : 'ghost'}
          size="xs"
          onClick={() => {
            if (lang !== current) changeLang(lang)
          }}
          aria-pressed={lang === current}
        >
          {t(`lang.${lang}`)}
        </Button>
      ))}
    </div>
  )
}
