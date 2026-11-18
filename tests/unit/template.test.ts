import { describe, expect, it } from 'vitest'
import { extractSlots, fillTemplate, partsToString } from '../../src/server/domain/template.ts'
import { questions } from '../helpers/fixtures.ts'

describe('fillTemplate', () => {
  const tpl = 'מאז {first_love}, {name} יודעת שאסור לוותר עליה. מה היא?'
  it('fills slots and marks them as personal parts', () => {
    const r = fillTemplate(tpl, { name: 'מיכל', first_love: 'יואב מהשכבה' }, questions, 'she')
    expect(partsToString(r.parts)).toBe('מאז יואב מהשכבה, מיכל יודעת שאסור לוותר עליה. מה היא?')
    expect(r.parts.filter((p) => p.t === 'slot').map((p) => p.v)).toEqual(['יואב מהשכבה', 'מיכל'])
    expect(r.missing).toEqual([])
  })
  it('uses the fallback for empty answers, per form', () => {
    const r = fillTemplate('{one_word} {first_love}', { first_love: '  ' }, questions, 'he')
    expect(partsToString(r.parts)).toBe('רך הפעם הראשונה')
  })
  it('reports slots with neither answer nor fallback', () => {
    const r = fillTemplate('שלום {name}', {}, questions, 'she')
    expect(r.missing).toEqual(['name'])
  })
  it('extracts slot keys once', () => {
    expect(extractSlots('{name} ו{name} ו{dream}')).toEqual(['name', 'dream'])
  })
})
