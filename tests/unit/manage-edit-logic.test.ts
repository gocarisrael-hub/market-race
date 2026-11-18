import { describe, expect, it } from 'vitest'
import type { Question } from '../../src/web/site/api.ts'
import { copy } from '../../src/web/site/copy.ts'
import { editError } from '../../src/web/site/logic.ts'

const qs: Question[] = [
  { slot: 'first_love', text: 'מי?', required: true, maxLen: 10 },
  { slot: 'dream', text: 'מה?', required: false, maxLen: 0 },
]

describe('manage edit form', () => {
  it('needs a name and the required answers, within length', () => {
    expect(editError(' ', { first_love: 'יואב' }, qs, 'he')).toBe(copy.questions.missingName('he'))
    expect(editError('א'.repeat(41), { first_love: 'יואב' }, qs, 'she')).toBe(copy.questions.tooLong)
    expect(editError('מיכל', {}, qs, 'she')).toBe(copy.questions.missingRequired)
    expect(editError('מיכל', { first_love: 'א'.repeat(11) }, qs, 'she')).toBe(copy.questions.tooLong)
    expect(editError('מיכל', { first_love: 'יואב' }, qs, 'she')).toBeNull()
  })
})
