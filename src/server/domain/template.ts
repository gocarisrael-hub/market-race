// Riddle templates: "{slot}" placeholders filled from the buyer's answers, with fallbacks.
import type { Form, Question, TextPart } from './types.ts'

const SLOT = /\{([a-z][a-z0-9_]*)\}/g

export function extractSlots(template: string): string[] {
  return [...new Set([...template.matchAll(SLOT)].map((m) => m[1]))]
}

// When a text has no version for a form, the closest one: a group reads best in the plural (couple).
const NEAREST: Record<Form, Form[]> = {
  she: ['she'],
  he: ['he', 'she'],
  couple: ['couple', 'she'],
  group: ['group', 'couple', 'she'],
  company: ['company', 'she'],
}

/** A per-form text for a form, falling back to the nearest form, then to any. */
export function textFor(texts: Partial<Record<Form, string>>, form: Form): string | undefined {
  for (const f of NEAREST[form] ?? [form]) if (texts[f]) return texts[f]
  return Object.values(texts).find(Boolean)
}

export function fallbackFor(q: Question | undefined, form: Form): string {
  if (!q) return ''
  if (typeof q.fallback === 'string') return q.fallback
  return textFor(q.fallback, form) ?? ''
}

/** The question as the buyer reads it for a form. */
export function questionTextFor(q: Question, form: Form): string {
  return textFor(q.text, form) ?? q.slot
}

/** Slots the buyer fills outside the question list: the name field (and for a group, its name). */
export function nameSlots(form: Form): string[] {
  return form === 'group' ? ['name', 'group_name'] : ['name']
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
