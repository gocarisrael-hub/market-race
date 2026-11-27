// The order on torn paper before paying: what was built, and the total from the server.
import type { Manage, Shop } from './api.ts'
import { copy } from './copy.ts'
import { currentPalette, type Draft, formatShekels, restrictionCount } from './logic.ts'
import { TornPaper } from './ui.tsx'

export function OrderSummary(props: {
  order: Manage
  shop: Shop
  /** The buyer's own draft of this order (choices the server does not return), when on this device. */
  draft: Draft | null
  photos?: number
}) {
  const { order, shop, draft } = props
  const occasion = shop.occasions.find((o) => o.key === order.occasionKey)?.label ?? ''
  const theme = draft ? shop.themes.find((t) => t.id === draft.themeId)?.name : undefined
  const palette = draft ? currentPalette(shop, draft)?.name : undefined
  // Each with how many of the group it is for, when not everyone ("טבעוני (1)").
  const allergens = draft
    ? [...draft.allergens, ...draft.diets].map((k) => {
        const n = restrictionCount(draft, k)
        const label = copy.home.dietLabels[k] ?? k
        return n < draft.people ? `${label} (${n})` : label
      })
    : []
  return (
    <TornPaper tilt="l">
      <h2 className="sub">{copy.checkout.summary}</h2>
      <dl className="summary">
        {occasion && (
          <>
            <dt>{copy.checkout.occasion}</dt>
            <dd>{occasion}</dd>
          </>
        )}
        <dt>{copy.checkout.honoree}</dt>
        <dd>{order.honoree}</dd>
        <dt>{copy.checkout.people}</dt>
        <dd>{copy.peopleCount(order.people)}</dd>
        {theme && (
          <>
            <dt>{copy.checkout.theme}</dt>
            <dd>{theme}</dd>
          </>
        )}
        {palette && (
          <>
            <dt>{copy.checkout.palette}</dt>
            <dd>{palette}</dd>
          </>
        )}
        {allergens.length > 0 && (
          <>
            <dt>{copy.checkout.allergens}</dt>
            <dd>{allergens.join(', ')}</dd>
          </>
        )}
        {!!props.photos && (
          <>
            <dt>{copy.checkout.photos}</dt>
            <dd>{copy.build.photosCount(props.photos)}</dd>
          </>
        )}
      </dl>
      {order.needsAnswers && <p className="hint">{copy.checkout.answersLater}</p>}
      <div className="summary-total" data-testid="total">
        <span>{copy.checkout.total}</span>
        <span>{formatShekels(order.amountAgorot)}</span>
      </div>
    </TornPaper>
  )
}
