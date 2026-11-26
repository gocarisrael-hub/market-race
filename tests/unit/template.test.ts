import { describe, expect, it } from 'vitest'
import { extractSlots, fillTemplate, partsToString, templateLines } from '../../src/server/domain/template.ts'
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

describe('multi-line riddles with personal lines', () => {
  const tpl = [
    'בסוף כל טקס שרים אותה כשכולם עומדים,',
    'היא עוד לא אבדה, גם בימים הקשים.',
    '? ומאז {first_love}, {name} יודעת: עליה לא מוותרים. || ו{name} יודעת: עליה אף פעם לא מוותרים.',
    '? ו{favorite_food}? רק אחרי זה.',
    'מה היא?',
  ].join('\n')

  it('keeps the lines, and fills a personal line when its slots are answered', () => {
    const r = fillTemplate(
      tpl,
      { name: 'מיכל', first_love: 'יואב מהשכבה', favorite_food: 'פסטה' },
      questions,
      'she',
    )
    expect(partsToString(r.parts).split('\n')).toEqual([
      'בסוף כל טקס שרים אותה כשכולם עומדים,',
      'היא עוד לא אבדה, גם בימים הקשים.',
      'ומאז יואב מהשכבה, מיכל יודעת: עליה לא מוותרים.',
      'ופסטה? רק אחרי זה.',
      'מה היא?',
    ])
    expect(r.missing).toEqual([])
  })

  it('takes the plain alternative when an answer is empty, and skips a line with none', () => {
    // first_love and favorite_food have fallbacks, but a personal line never uses a fallback.
    const r = fillTemplate(tpl, { name: 'מיכל', first_love: '  ' }, questions, 'she')
    const lines = partsToString(r.parts).split('\n')
    expect(lines).toEqual([
      'בסוף כל טקס שרים אותה כשכולם עומדים,',
      'היא עוד לא אבדה, גם בימים הקשים.',
      'ומיכל יודעת: עליה אף פעם לא מוותרים.',
      'מה היא?',
    ])
    expect(r.parts.filter((p) => p.t === 'slot').map((p) => p.v)).toEqual(['מיכל'])
    expect(r.missing).toEqual([])
  })

  it('never reports a slot of a skipped line as missing', () => {
    const r = fillTemplate('קבוע.\n? {dream} עוד יתגשם.', {}, questions, 'she')
    expect(partsToString(r.parts)).toBe('קבוע.')
    expect(r.missing).toEqual([])
  })

  it('counts a hidden question as answered (its phrase is written on purpose)', () => {
    const qs = [
      ...questions,
      { slot: 'group_legend', text: {}, required: false, fallback: 'סבא וסבתא', maxLen: 40, hidden: true },
    ]
    const r = fillTemplate('? לכבוד {group_legend}. || לכבוד כולם.', {}, qs, 'group')
    expect(partsToString(r.parts)).toBe('לכבוד סבא וסבתא.')
  })

  it('lists the lines with their slots for the admin', () => {
    const lines = templateLines(tpl)
    expect(lines).toHaveLength(5)
    expect(lines[2]).toMatchObject({ personal: true })
    expect(lines[2].alternatives.map((a) => a.slots)).toEqual([['first_love', 'name'], ['name']])
    expect(lines[0]).toMatchObject({ personal: false, alternatives: [{ slots: [] }] })
  })

  it('ignores blank lines and Windows line ends', () => {
    const r = fillTemplate('שורה אחת\r\n\r\nשורה שתיים', {}, questions, 'she')
    expect(partsToString(r.parts)).toBe('שורה אחת\nשורה שתיים')
  })
})
