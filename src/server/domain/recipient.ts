// Occasion × recipient → the form (grammar) and the question set. Pure: shared by the server, the
// site and the admin.
import {
  type Decor,
  type Form,
  type OccasionRecipients,
  RECIPIENT_FORM,
  RECIPIENTS,
  type Recipient,
} from './types.ts'

export interface OccasionLike {
  audience: 'private' | 'company'
  forms: Form[]
  questionSetId: number | null
  /** Empty on occasions saved before recipients existed: derived from `forms`. */
  recipients?: OccasionRecipients | null
  decor?: Decor | string | null
}

export interface RecipientChoice {
  recipient: Recipient
  form: Form
  questionSetId: number | null
}

/** The recipient an old order (form only) or old occasion form stands for. */
export function recipientForForm(form: Form, decor?: string | null): Recipient | null {
  if (form === 'company') return null
  if (form === 'group') return decor === 'family' ? 'family' : 'group'
  return form
}

/**
 * The recipients an occasion offers, in the fixed order (one person first), each with its form and
 * question set. A company occasion offers none.
 */
export function occasionRecipients(occ: OccasionLike): RecipientChoice[] {
  if (occ.audience !== 'private') return []
  const own = occ.recipients ?? {}
  const keys = Object.keys(own).filter((k): k is Recipient => (RECIPIENTS as readonly string[]).includes(k))
  const sets: OccasionRecipients = {}
  if (keys.length) for (const k of keys) sets[k] = own[k] ?? null
  else
    for (const f of occ.forms) {
      const r = recipientForForm(f, occ.decor)
      if (r) sets[r] = null
    }
  return RECIPIENTS.filter((r) => r in sets).map((recipient) => ({
    recipient,
    form: RECIPIENT_FORM[recipient],
    questionSetId: sets[recipient] ?? occ.questionSetId,
  }))
}

/** The recipient's choice on an occasion, or null when the occasion does not offer it. */
export function resolveRecipient(occ: OccasionLike, recipient: Recipient | null | undefined) {
  if (!recipient) return null
  return occasionRecipients(occ).find((c) => c.recipient === recipient) ?? null
}

/** The recipient picked when an occasion is chosen: the first offered (one person first). */
export const defaultRecipient = (occ: OccasionLike): Recipient | null =>
  occasionRecipients(occ)[0]?.recipient ?? null

/**
 * The question set of an order: its recipient's on the occasion, else the occasion's own (company
 * games, and orders whose recipient the occasion no longer offers).
 */
export function questionSetIdFor(occ: OccasionLike, recipient: Recipient | null | undefined): number | null {
  return resolveRecipient(occ, recipient)?.questionSetId ?? occ.questionSetId
}

/** An order's recipient: stored, or for an order placed before recipients existed, its form's. */
export function orderRecipient(
  order: { recipient?: string | null; form: Form; kind?: string },
  occ?: { decor?: string | null } | null,
): Recipient | null {
  if (order.kind === 'company' || order.form === 'company') return null
  if (order.recipient && (RECIPIENTS as readonly string[]).includes(order.recipient))
    return order.recipient as Recipient
  return recipientForForm(order.form, occ?.decor)
}

/** The forms an occasion's recipients use (kept in `occasions.forms` for older readers). */
export const formsOfRecipients = (recipients: OccasionRecipients): Form[] => [
  ...new Set(
    RECIPIENTS.filter((r) => r in recipients).map((r) => RECIPIENT_FORM[r]),
  ),
]
