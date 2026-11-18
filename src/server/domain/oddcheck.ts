// Odd-answer check: decides whether an order goes straight to "ready" or waits for review.
import type { OrderFlag, Question } from './types.ts'

export interface OddRules {
  profanity: string[]
  maxRepeatedChars: number // e.g. 4: "חחחחח" (5 in a row) is odd
}

export const DEFAULT_ODD_RULES: OddRules = { profanity: [], maxRepeatedChars: 4 }

export function checkAnswers(
  answers: Record<string, string>,
  questions: Question[],
  rules: OddRules,
  extra: Record<string, string> = {},
): OrderFlag[] {
  const flags: OrderFlag[] = []
  const words = rules.profanity.map((w) => w.trim().toLowerCase()).filter(Boolean)
  const repeat = new RegExp(`(.)\\1{${Math.max(1, rules.maxRepeatedChars)},}`, 'u')

  for (const q of questions) {
    if (q.hidden) continue
    const v = (answers[q.slot] ?? '').trim()
    if (!v) {
      if (q.required) flags.push({ code: 'empty_required', slot: q.slot, message: `חסרה תשובה: ${q.slot}` })
      continue
    }
    if (q.maxLen > 0 && [...v].length > q.maxLen)
      flags.push({ code: 'too_long', slot: q.slot, message: `ארוך מדי (${[...v].length}/${q.maxLen})` })
  }
  const texts = { ...answers, ...extra }
  for (const [slot, raw] of Object.entries(texts)) {
    const v = (raw ?? '').toLowerCase()
    if (!v) continue
    const hit = words.find((w) => v.includes(w))
    if (hit) flags.push({ code: 'profanity', slot, message: `מילה בעייתית: ${hit}` })
    if (repeat.test(v)) flags.push({ code: 'repeated_chars', slot, message: 'תווים חוזרים' })
  }
  return flags
}
