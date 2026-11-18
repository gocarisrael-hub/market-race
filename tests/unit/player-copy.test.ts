import { describe, expect, it } from 'vitest'
import { COPY, type CopyKey, fill, joinList, makeT, pick, riddleTitle } from '../../src/web/player/copy.ts'

describe('player copy', () => {
  it('picks the variant for the honoree form, falling back to the default', () => {
    expect(pick('riddle.submit', 'she')).toBe('בודקות!')
    expect(pick('riddle.submit', 'he')).toBe('בודקים!')
    expect(pick('riddle.submit', 'couple')).toBe('בודקים!')
    expect(pick('riddle.submit', 'company')).toBe('בודקים!')
    expect(pick('reveal.correct', 'he')).toBe('נכון!')
  })

  it('lets the owner override a key for every form or for one form', () => {
    const over = {
      'riddle.submit': 'קדימה!',
      'riddle.submit.company': 'צוות, קדימה!',
      'reveal.correct': '  ',
    }
    expect(pick('riddle.submit', 'she', over)).toBe('קדימה!')
    expect(pick('riddle.submit', 'company', over)).toBe('צוות, קדימה!')
    // A blank override does not wipe the text.
    expect(pick('reveal.correct', 'she', over)).toBe('נכון!')
  })

  it('fills placeholders and leaves unknown ones visible', () => {
    expect(fill('המירוץ של {name}', { name: 'מיכל' })).toBe('המירוץ של מיכל')
    expect(fill('{n} מנות {x}', { n: 4 })).toBe('4 מנות {x}')
    const t = makeT('she', { 'start.ribbon': 'החגיגה של {name}' })
    expect(t('start.ribbon', { name: 'מיכל' })).toBe('החגיגה של מיכל')
  })

  it('joins lists the Hebrew way', () => {
    expect(joinList([])).toBe('')
    expect(joinList(['בוטנים'])).toBe('בוטנים')
    expect(joinList(['בוטנים', 'גלוטן'])).toBe('בוטנים וגלוטן')
    expect(joinList(['בוטנים', 'גלוטן', 'חלב'])).toBe('בוטנים, גלוטן וחלב')
  })

  it('names riddles by ordinal, the last one as last', () => {
    const t = makeT('she')
    expect(riddleTitle(t, 0, false)).toBe('חידה ראשונה')
    expect(riddleTitle(t, 1, false)).toBe('חידה שנייה')
    expect(riddleTitle(t, 4, true)).toBe('חידה אחרונה')
    expect(riddleTitle(t, 11, false)).toBe('חידה 12')
  })

  it('has no empty texts and no forbidden names', () => {
    for (const key of Object.keys(COPY) as CopyKey[]) {
      for (const form of ['she', 'he', 'couple', 'company']) {
        const text = pick(key, form)
        expect(text.trim(), key).not.toBe('')
        expect(text).not.toMatch(/המירוץ למיליון|דוגרי|dugri/i)
      }
    }
  })
})
