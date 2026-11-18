// Riddle templates: "{slot}" placeholders filled from the buyer's answers, with fallbacks.
import type { Form, Question, TextPart } from './types.ts'

const SLOT = /\{([a-z][a-z0-9_]*)\}/g

export function extractSlots(template: string): string[] {
  return [...new Set([...template.matchAll(SLOT)].map((m) => m[1]))]
}

export function fallbackFor(q: Question | undefined, form: Form): string {
  if (!q) return ''
  if (typeof q.fallback === 'string') return q.fallback
  return q.fallback[form] ?? q.fallback.she ?? Object.values(q.fallback)[0] ?? ''
}

export interface FillResult {
  parts: TextPart[]
  missing: string[] // slots that ended up empty (no answer and no fallback)
}

export function fillTemplate(
  template: string,
  answers: Record<string, string>,
  questions: Question[],
  form: Form,
): FillResult {
  const bySlot = new Map(questions.map((q) => [q.slot, q]))
  const parts: TextPart[] = []
  const missing: string[] = []
  let last = 0
  for (const m of template.matchAll(SLOT)) {
    const slot = m[1]
    if (m.index > last) parts.push({ t: 'text', v: template.slice(last, m.index) })
    const answer = (answers[slot] ?? '').trim()
    const value = answer || fallbackFor(bySlot.get(slot), form)
    if (value) parts.push({ t: 'slot', v: value, slot })
    else missing.push(slot)
    last = m.index + m[0].length
  }
  if (last < template.length) parts.push({ t: 'text', v: template.slice(last) })
  return { parts: mergeText(parts), missing }
}

function mergeText(parts: TextPart[]): TextPart[] {
  const out: TextPart[] = []
  for (const p of parts) {
    const prev = out[out.length - 1]
    if (p.t === 'text' && prev?.t === 'text') prev.v += p.v
    else out.push({ ...p })
  }
  return out
}

export function partsToString(parts: TextPart[]): string {
  return parts.map((p) => p.v).join('')
}
