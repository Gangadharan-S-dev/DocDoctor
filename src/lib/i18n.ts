import { createContext, useContext } from 'react'

export type Lang = 'en' | 'es'

export const DICT = {
  en: {
    'nav.home': 'Home', 'nav.allTools': 'All Tools', 'nav.categories': 'Categories', 'nav.about': 'About',
    'nav.searchPlaceholder': 'Search tools…', 'nav.free': 'Free · No sign-up',
    'home.kicker': 'Free online file tools',
    'home.titleA': 'Every file. Every tool.', 'home.titleB': 'One place.',
    'home.sub': 'Compress, convert, edit and manage your files with powerful online tools. Simple, secure and free — no account, no installs.',
    'home.searchBtn': 'Search', 'home.browseAll': 'Browse all tools',
    'common.favorites': 'Your favorites', 'common.recent': 'Recently used',
    'common.processing': 'Processing…', 'common.cancel': 'Cancel',
  },
  es: {
    'nav.home': 'Inicio', 'nav.allTools': 'Todas las herramientas', 'nav.categories': 'Categorías', 'nav.about': 'Acerca de',
    'nav.searchPlaceholder': 'Buscar herramientas…', 'nav.free': 'Gratis · Sin registro',
    'home.kicker': 'Herramientas de archivos gratuitas en línea',
    'home.titleA': 'Cada archivo. Cada herramienta.', 'home.titleB': 'Un solo lugar.',
    'home.sub': 'Comprime, convierte, edita y gestiona tus archivos con potentes herramientas en línea. Simple, seguro y gratuito, sin cuenta ni instalaciones.',
    'home.searchBtn': 'Buscar', 'home.browseAll': 'Ver todas las herramientas',
    'common.favorites': 'Tus favoritos', 'common.recent': 'Usados recientemente',
    'common.processing': 'Procesando…', 'common.cancel': 'Cancelar',
  },
} as const

export type I18nKey = keyof (typeof DICT)['en']
export const LANG_KEY = 'docdoctor:lang'

export interface I18nCtx { lang: Lang; setLang: (l: Lang) => void; t: (k: I18nKey) => string }
export const Ctx = createContext<I18nCtx>({ lang: 'en', setLang: () => {}, t: (k) => DICT.en[k] })

export const useI18n = () => useContext(Ctx)
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'EN' }, { id: 'es', label: 'ES' },
]

