import { useEffect, useState, type ReactNode } from 'react'
import { Ctx, DICT, LANG_KEY, type I18nKey, type Lang } from '../lib/i18n'

export default function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY)
      return saved === 'es' || saved === 'hi' ? saved : 'en'
    } catch { return 'en' }
  })
  useEffect(() => { document.documentElement.lang = lang }, [lang])
  const setLang = (l: Lang) => {
    if (!(l in DICT)) return
    setLangState(l)
    try { localStorage.setItem(LANG_KEY, l) } catch { /* private mode */ }
  }
  const t = (k: I18nKey): string => (DICT[lang] ?? DICT.en)[k] ?? DICT.en[k]
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>
}
