/**
 * OCR languages offered in the UI (Tesseract language codes).
 * Kept in its own tiny module so tool pages can render the language
 * picker without loading the OCR/PDF engines.
 */
export interface OcrLanguage {
  code: string
  label: string
}

export const OCR_LANGUAGES: OcrLanguage[] = [
  { code: 'eng', label: 'English' },
  { code: 'spa', label: 'Spanish (Español)' },
  { code: 'hin', label: 'Hindi (हिन्दी)' },
  { code: 'fra', label: 'French (Français)' },
  { code: 'deu', label: 'German (Deutsch)' },
  { code: 'ita', label: 'Italian (Italiano)' },
  { code: 'por', label: 'Portuguese (Português)' },
  { code: 'nld', label: 'Dutch (Nederlands)' },
  { code: 'rus', label: 'Russian (Русский)' },
  { code: 'ara', label: 'Arabic (العربية)' },
  { code: 'chi_sim', label: 'Chinese, Simplified (简体中文)' },
  { code: 'jpn', label: 'Japanese (日本語)' },
  { code: 'kor', label: 'Korean (한국어)' },
]

const CODES = new Set(OCR_LANGUAGES.map((l) => l.code))

/** Validate a language code from UI state before it reaches Tesseract. */
export function normalizeOcrLang(code: string): string {
  const c = (code ?? '').trim().toLowerCase()
  if (!CODES.has(c)) throw new Error(`Unsupported OCR language: "${code}".`)
  return c
}
