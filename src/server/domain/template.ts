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

/**
 * A riddle template is one or more lines. A line that starts with "?" is a personal line: it is
 * shown only when the buyer answered every slot in it (the name slots always count, and so does a
 * hidden question, whose fallback is written on purpose). "||" separates alternatives, tried in
 * order; the first one whose slots are all answered is used, so the last can be a plain line that
 * keeps the rhyme. When no alternative fits, the line is skipped. Other lines use fallbacks.
 */
export interface TemplateLine {
  personal: boolean
  alternatives: { text: string; slots: string[] }[]
}

export function templateLines(template: string): TemplateLine[] {
  return template
    .split(/\r?\n/)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((line) => {
      const personal = line.startsWith('?')
      const body = personal ? line.slice(1).trim() : line
      const alts = personal ? body.split('||').map((a) => a.trim()) : [body]
      return {
        personal,
        alternatives: alts.filter(Boolean).map((text) => ({ text, slots: extractSlots(text) })),
      }
    })
}

/** A slot has a real answer: the buyer's (or the order's name), or a hidden question's set phrase. */
export function isAnswered(
  slot: string,
  answers: Record<string, string>,
  questions: Question[],
  form: Form,
): boolean {
  if ((answers[slot] ?? '').trim()) return true
  const q = questions.find((x) => x.slot === slot)
  return !!q?.hidden && !!fallbackFor(q, form).trim()
}

export function fillTemplate(
  template: string,
  answers: Record<string, string>,
  questions: Question[],
  form: Form,
): FillResult {
  const parts: TextPart[] = []
  const missing: string[] = []
  let first = true
  for (const line of templateLines(template)) {
    let text: string | undefined
    if (line.personal) {
      text = line.alternatives.find((a) =>
        a.slots.every((s) => isAnswered(s, answers, questions, form)),
      )?.text
      if (text === undefined) continue
    } else text = line.alternatives[0]?.text ?? ''
    if (!first) parts.push({ t: 'text', v: '\n' })
    first = false
    const r = fillLine(text, answers, questions, form)
    parts.push(...r.parts)
    missing.push(...r.missing)
  }
  return { parts: mergeText(parts), missing: [...new Set(missing)] }
}

function fillLine(
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
  return { parts, missing }
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
