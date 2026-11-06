import { describe, expect, it } from 'vitest'
import { CATEGORIES, IMPLEMENTED_IDS, SERVER_TOOL_IDS, TOOLS, toolById } from '../../src/data/tools'

describe('tool registry integrity', () => {
  it('has unique tool ids', () => {
    const ids = TOOLS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every implemented id exists in the registry', () => {
    for (const id of IMPLEMENTED_IDS) expect(toolById(id), id).toBeDefined()
  })

  it('every registered tool points at a real category', () => {
    const cats = new Set(CATEGORIES.map((c) => c.id))
    for (const t of TOOLS) expect(cats.has(t.category), t.id).toBe(true)
  })

  it('server tools are registered tools', () => {
    for (const id of Object.keys(SERVER_TOOL_IDS)) expect(toolById(id), id).toBeDefined()
  })

  it('OCR tools are registered and live', () => {
    expect(toolById('ocr-pdf')).toBeDefined()
    expect(toolById('image-ocr')).toBeDefined()
    expect(IMPLEMENTED_IDS.has('ocr-pdf')).toBe(true)
    expect(IMPLEMENTED_IDS.has('image-ocr')).toBe(true)
  })
})
