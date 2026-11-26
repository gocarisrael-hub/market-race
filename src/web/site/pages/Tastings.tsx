// /tastings: what you taste on each route, from the tasting teasers and their icons (as on step 1
// of the order). Never stall names or locations: the stalls are the riddles' answers, and the
// API never sends them. Allergies and diets are marked only inside the order (its diet stage).
import type { Shop } from '../api.ts'
import { copy } from '../copy.ts'
import { orderableThemes } from '../logic.ts'
import { RouteTastings } from '../tastings.tsx'
import { Brush, Deco, SiteNav } from '../ui.tsx'

const NONE: string[] = []

export function Tastings({ shop }: { shop: Shop }) {
  const c = copy.tastingsPage
  return (
    <main className="page tastings-page" data-decor="generic">
      <Deco icon="awning" className="sway" style={{ top: -30, left: -36, width: 200 }} />
      <Deco
        icon="hummus"
        className="bob"
        style={{ top: 300, left: -34, width: 70, ['--r' as string]: '-8deg' }}
      />
      <SiteNav current="tastings" />
      <header className="t-head">
        <h1 className="title rise">
          {c.title[0]}
          <br />
          {c.title[1]}
        </h1>
        <p className="lead">{c.intro}</p>
      </header>

      <TastingsExplorer shop={shop} />

      <div className="t-cta">
        <Brush href="/order" icon="flagStart">
          {c.cta}
        </Brush>
      </div>
    </main>
  )
}

/** The routes' tastings: teasers and icons only; also on the landing page. No allergy or diet picker here. */
export function TastingsExplorer({ shop }: { shop: Shop }) {
  const c = copy.tastingsPage
  // One route per market: the theme that leads to it (the order's own choice of route).
  const seen = new Set<number>()
  const byMarket = orderableThemes(shop).filter((t) => !seen.has(t.marketId) && seen.add(t.marketId))

  return (
    <div className="t-body">
      <div className="t-routes">
        {byMarket.length === 0 && <p className="status">{c.none}</p>}
        {byMarket.map((t) => {
          const market = shop.markets.find((m) => m.id === t.marketId)?.name ?? ''
          return (
            <section key={t.marketId} className="t-route" aria-label={c.route(market)}>
              <h2 className="sub">{c.route(market)}</h2>
              <RouteTastings shop={shop} themeId={t.id} allergens={NONE} diets={NONE} />
            </section>
          )
        })}
      </div>
    </div>
  )
}
