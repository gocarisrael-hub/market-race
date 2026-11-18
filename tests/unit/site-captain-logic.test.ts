// Pure logic of the captain's start and the hint questions on the site.
import { describe, expect, it } from 'vitest'
import { copy } from '../../src/web/site/copy.ts'
import {
  chooseOccasion,
  clampPlayers,
  cleanHintQuestions,
  editError,
  emptyDraft,
  hintQuestionsError,
  orderPayload,
  step2Error,
} from '../../src/web/site/logic.ts'

describe('captain start and hint questions (site logic)', () => {
  it('keeps the players between 1 and the portions bought', () => {
    expect(clampPlayers(0, 5)).toBe(1)
    expect(clampPlayers(3, 5)).toBe(3)
    expect(clampPlayers(9, 5)).toBe(5)
    expect(clampPlayers(2, 0)).toBe(1)
  })

  it('keeps only complete hint questions, trimmed', () => {
    expect(
      cleanHintQuestions([
        { question: ' איך קוראים לכלב? ', answer: ' שוקו ' },
        { question: '', answer: '' },
        { question: 'בלי תשובה', answer: ' ' },
      ]),
    ).toEqual([{ question: 'איך קוראים לכלב?', answer: 'שוקו' }])
    expect(cleanHintQuestions(undefined)).toEqual([])
  })

  it('a question without an answer (or the other way) is an error; empty rows are fine', () => {
    expect(hintQuestionsError([{ question: '', answer: '' }])).toBeNull()
    expect(hintQuestionsError([{ question: 'מה?', answer: '' }])).toBe(copy.hintQuestions.incomplete)
    expect(hintQuestionsError([{ question: '', answer: 'כן' }])).toBe(copy.hintQuestions.incomplete)
    expect(hintQuestionsError([{ question: 'מה?', answer: 'x'.repeat(61) }])).toBe(copy.questions.tooLong)
    expect(editError('מיכל', {}, [], 'she', [{ question: 'מה?', answer: '' }])).toBe(
      copy.hintQuestions.incomplete,
    )
  })

  it('sends hint questions with the order, not when answering later', () => {
    const occ = { key: 'b', label: 'b', audience: 'private' as const, forms: ['she'] }
    const d = {
      ...chooseOccasion(emptyDraft(), occ),
      honoreeName: 'מיכל',
      hintQuestions: [
        { question: 'מה הצבע?', answer: 'כחול' },
        { question: '', answer: '' },
      ],
    }
    expect(step2Error(d, [])).toBeNull()
    expect(orderPayload(d, []).hintQuestions).toEqual([{ question: 'מה הצבע?', answer: 'כחול' }])
    expect(orderPayload({ ...d, answersLater: true }, []).hintQuestions).toEqual([])
    expect(step2Error({ ...d, hintQuestions: [{ question: 'מה?', answer: '' }] }, [])).toBe(
      copy.hintQuestions.incomplete,
    )
  })
})
