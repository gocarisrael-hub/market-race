import { describe, expect, it } from 'vitest'
import { editDistance, matchAnswer, normalizeAnswer } from '../../src/server/domain/matcher.ts'

describe('normalizeAnswer', () => {
  it('trims, folds case, strips niqqud and punctuation', () => {
    expect(normalizeAnswer('  תִּקְוָה! ')).toBe('תקוה')
    expect(normalizeAnswer("ג'חנון")).toBe('גחנון')
    expect(normalizeAnswer('ג׳חנון')).toBe('גחנון')
    expect(normalizeAnswer('Cheers!!')).toBe('cheers')
    expect(normalizeAnswer('פלאפל,   בפיתה.')).toBe('פלאפל בפיתה')
  })
})

describe('editDistance', () => {
  it('counts edits', () => {
    expect(editDistance('תקווה', 'תקוה')).toBe(1)
    expect(editDistance('abc', 'abc')).toBe(0)
    expect(editDistance('kitten', 'sitting')).toBe(3)
    expect(editDistance('a', 'abcd', 1)).toBe(2)
  })
})

describe('matchAnswer', () => {
  const accepted = ['התקווה', 'תיקווה']
  it('matches the answer and accepted list exactly', () => {
    expect(matchAnswer('תקווה', 'תקווה', accepted)).toMatchObject({ ok: true, via: 'exact' })
    expect(matchAnswer('התקווה', 'תקווה', accepted)).toMatchObject({ ok: true, via: 'exact' })
    expect(matchAnswer('ג׳חנון', "ג'חנון")).toMatchObject({ ok: true, via: 'exact' })
  })
  it('allows one typo', () => {
    expect(matchAnswer('תקוה', 'תקווה', accepted)).toMatchObject({ ok: true, via: 'fuzzy' })
    expect(matchAnswer('פלפל', 'פלאפל')).toMatchObject({ ok: true, via: 'fuzzy' })
  })
  it('ignores spaces between words', () => {
    expect(matchAnswer('פלאפלבפיתה', 'פלאפל', ['פלאפל בפיתה'])).toMatchObject({ ok: true })
  })
  it('rejects two typos, empty input and unrelated words', () => {
    expect(matchAnswer('תקה', 'תקווה')).toEqual({ ok: false })
    expect(matchAnswer('   ', 'תקווה')).toEqual({ ok: false })
    expect(matchAnswer('בוריק', 'פלאפל')).toEqual({ ok: false })
  })
  it('does not fuzz very short answers', () => {
    expect(matchAnswer('אב', 'אם')).toEqual({ ok: false })
  })
})
