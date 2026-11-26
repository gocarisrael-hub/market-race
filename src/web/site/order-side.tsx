// The order's live preview beside the form on wide screens (from 1024px): the chosen map in its
// palette, framed by the occasion's doodles, what the group tastes on the way, and the price.
// Phones never render it: they show the same pieces inline, in the flow of the form.
import { Doodles } from '../shared/decor.tsx'
import { useWide } from '../shared/useWide.ts'
import type { Shop } from './api.ts'
import { copy } from './copy.ts'
import { currentPalette, type Draft, decorFor, formatShekels, orderableThemes, priceAgorot } from './logic.ts'
import { RouteTastings } from './tastings.tsx'
import { LookPreview, Underline } from './ui.tsx'

const SIDE_SPOTS = [
  { top: -18, right: '4%', size: 58, rot: 12 },
  { top: '30%', left: -34, size: 50, rot: -10 },
  { top: '62%', right: -30, size: 46, rot: 8 },
  { bottom: -10, left: '10%', size: 52, rot: -14 },
]

export function OrderSide(props: { shop: Shop; draft: Draft }) {
  const wide = useWide()
  if (!wide) return null
  const { shop, draft: d } = props
  const themes = orderableThemes(shop)
  const theme = themes.find((t) => t.id === d.themeId) ?? themes[0]
  const pal = currentPalette(shop, d)
  const decor = decorFor(shop, d.occasionKey)
  const total = priceAgorot(shop, d.occasionKey, d.people)
  const per = d.occasionKey ? shop.prices[d.occasionKey] : undefined
  return (
    <aside className="order-side">
      {theme && (
        <div className="side-look">
          {decor && <Doodles key={decor} className="side-doodles" decor={decor} spots={SIDE_SPOTS} />}
          <LookPreview
            map={theme.map}
            palette={pal?.palette ?? theme.palette}
            name={pal?.name ?? theme.name}
          />
          <p className="side-caption">{pal ? `${theme.name} · ${pal.name}` : theme.name}</p>
        </div>
      )}
      <RouteTastings shop={shop} themeId={theme?.id ?? null} allergens={d.allergens} diets={d.diets} />
      {total !== null && per && (
        <section className="section price" aria-live="polite" data-testid="price">
          <span className="hint">{copy.home.total}</span>
          <span className="total">
            {formatShekels(total)}
            <Underline />
          </span>
          {per.perPerson > 0 && (
            <span className="hint">{copy.home.perPerson(formatShekels(per.perPerson))}</span>
          )}
        </section>
      )}
    </aside>
  )
}
