// The help button's WhatsApp link. Pure, unit tested.
import { waLink } from '../../server/domain/phone.ts'
import type { PlayerView, Support } from './api.ts'
import { fill, type T } from './copy.ts'

/**
 * The stop the group is on (1-based; on a mini-game, the stop it leads to), or null before the
 * start and after the end.
 */
export function currentStopNumber(view: PlayerView): number | null {
  if (['riddle', 'revealed', 'redeem', 'minigame'].includes(view.step)) return view.stopIndex + 1
  return null
}

/** The prefilled text: the owner's message or the default, with the honoree and the stop filled in. */
export function supportText(support: Support, view: PlayerView, t: T): string {
  const n = currentStopNumber(view)
  const vars = { name: view.honoree, n: n ?? '' }
  const own = support.message.trim()
  const text = own ? fill(own, vars) : n ? t('help.waMessageStop', vars) : t('help.waMessage', vars)
  return text.replace(/\{\w+\}/g, '').trim()
}

/** wa.me link to the owner's number, or null when no (valid) number is set. */
export function supportHref(support: Support, view: PlayerView, t: T): string | null {
  return waLink(support.whatsapp, supportText(support, view, t))
}

/** The "stall closed" report is offered only while a stall is shown. */
export function canReportClosed(view: PlayerView): boolean {
  return (view.step === 'revealed' || view.step === 'redeem') && !!view.current?.reveal
}
