import { createContext, useContext } from 'react'

export type Lang = 'en' | 'es' | 'hi'

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
  hi: {
    'nav.home': 'होम', 'nav.allTools': 'सभी टूल', 'nav.categories': 'श्रेणियाँ', 'nav.about': 'परिचय',
    'nav.searchPlaceholder': 'टूल खोजें…', 'nav.free': 'मुफ़्त · बिना साइन-अप',
    'home.kicker': 'मुफ़्त ऑनलाइन फ़ाइल टूल',
    'home.titleA': 'हर फ़ाइल। हर टूल।', 'home.titleB': 'एक ही जगह।',
    'home.sub': 'शक्तिशाली ऑनलाइन टूल से अपनी फ़ाइलों को कंप्रेस, कन्वर्ट, एडिट और मैनेज करें। सरल, सुरक्षित और मुफ़्त — न खाता, न इंस्टॉल।',
    'home.searchBtn': 'खोजें', 'home.browseAll': 'सभी टूल देखें',
    'common.favorites': 'आपके पसंदीदा', 'common.recent': 'हाल में उपयोग किए गए',
    'common.processing': 'प्रोसेस हो रहा है…', 'common.cancel': 'रद्द करें',
  },
} as const

export type I18nKey = keyof (typeof DICT)['en']
export const LANG_KEY = 'docdoctor:lang'

export interface I18nCtx { lang: Lang; setLang: (l: Lang) => void; t: (k: I18nKey) => string }
export const Ctx = createContext<I18nCtx>({ lang: 'en', setLang: () => {}, t: (k) => DICT.en[k] })

export const useI18n = () => useContext(Ctx)
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'EN' }, { id: 'es', label: 'ES' }, { id: 'hi', label: 'हिं' },
]

