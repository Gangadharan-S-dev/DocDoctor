import { describe, expect, it } from 'vitest'
import { DICT, LANGS } from '../../src/lib/i18n'

describe('i18n dictionaries', () => {
  it('every selectable language has a complete dictionary', () => {
    const enKeys = Object.keys(DICT.en).sort()
    for (const { id } of LANGS) {
      expect(DICT[id], id).toBeDefined()
      expect(Object.keys(DICT[id]).sort()).toEqual(enKeys)
    }
  })
})
