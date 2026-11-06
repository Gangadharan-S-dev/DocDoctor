import { beforeEach, describe, expect, it } from 'vitest'
import { getFavorites, getRecent, isFavorite, pushRecent, toggleFavorite } from '../../src/lib/prefs'

describe('prefs (favorites + recent)', () => {
  beforeEach(() => localStorage.clear())

  it('toggles favorites on and off', () => {
    expect(isFavorite('merge-pdf')).toBe(false)
    toggleFavorite('merge-pdf')
    expect(isFavorite('merge-pdf')).toBe(true)
    expect(getFavorites()).toEqual(['merge-pdf'])
    toggleFavorite('merge-pdf')
    expect(getFavorites()).toEqual([])
  })

  it('recent list dedupes, newest first, capped at 8', () => {
    pushRecent('a'); pushRecent('b'); pushRecent('a')
    expect(getRecent()).toEqual(['a', 'b'])
    for (let i = 0; i < 10; i++) pushRecent(`t${i}`)
    expect(getRecent()).toHaveLength(8)
    expect(getRecent()[0]).toBe('t9')
  })

  it('survives corrupt stored data', () => {
    localStorage.setItem('docdoctor:favorites', '{not json')
    expect(getFavorites()).toEqual([])
  })
})
