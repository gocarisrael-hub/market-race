import { describe, expect, it } from 'vitest'
import { checkAnswers } from '../../src/server/domain/oddcheck.ts'
import { questions } from '../helpers/fixtures.ts'

const rules = { profanity: ['מילהרעה'], maxRepeatedChars: 4 }

describe('checkAnswers', () => {
  it('passes clean answers', () => {
    expect(checkAnswers({ name: 'מיכל', first_love: 'יואב' }, questions, rules)).toEqual([])
  })
  it('flags empty required, too long, profanity and repeated characters', () => {
    const flags = checkAnswers(
      { name: '', first_love: 'א'.repeat(41), catchphrase: 'יאללה מילהרעה', one_word: 'חחחחחח' },
      questions,
      rules,
    )
    expect(flags.map((f) => [f.code, f.slot])).toEqual([
      ['empty_required', 'name'],
      ['too_long', 'first_love'],
      ['repeated_chars', 'first_love'],
      ['profanity', 'catchphrase'],
      ['repeated_chars', 'one_word'],
    ])
  })
  it('also checks extra texts like letter notes', () => {
    const flags = checkAnswers({ name: 'מיכל' }, questions, rules, { letter_0: 'מילהרעה' })
    expect(flags[0]).toMatchObject({ code: 'profanity', slot: 'letter_0' })
  })
})
