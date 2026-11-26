// /tastings: what you taste on each route, from the tasting teasers and their icons (as on step 1
// of the order). Never stall names or locations: the stalls are the riddles' answers, and the
// API never sends them. Marking allergens and diets shows the swaps live, through the same
// preview the order uses.
import { useState } from 'react'
import type { Shop } from '../api.ts'
import { copy } from '../copy.ts'
import { orderableThemes, toggle } from '../logic.ts'
import { RouteTastings } from '../tastings.tsx'
import { Brush, Deco, Opt, QNote, SiteNav } from '../ui.tsx'

export function Tastings({ shop }: { shop: Shop }) {
  const c = copy.tastingsPage
  const [allergens, setAllergens] = useState<string[]>([])
  const [diets, setDiets] = useState<string[]>([])
  // One route per market: the theme that leads to it (the order's own choice of route).
  const seen = new Set<number>()
  const byMarket = orderableThemes(shop).filter((t) => !seen.has(t.marketId) && seen.add(t.marketId))

  return (
    <main className="page tastings-page" data-decor="generic">
      <Deco icon="awning" className="sway" style={{ top: -30, left: -36, width: 200 }} />
      <Deco
        icon="hummus"
        className="bob"
        style={{ top: 210, left: -30, width: 84, ['--r' as string]: '-8deg' }}
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

      <div className="t-body">
        <aside className="t-filter" aria-labelledby="t-filter">
          <QNote id="t-filter" tilt={-1.2} icon="plate">
            {c.filterTitle}
          </QNote>
          <p className="hint">{c.filterHint}</p>
          <div className="row" style={{ gap: '2px 10px' }}>
            {shop.allergens.map((a) => (
              <Opt
                key={a}
                small
                role="checkbox"
                pressed={allergens.includes(a)}
                onClick={() => setAllergens(toggle(allergens, a))}
              >
                {a}
              </Opt>
            ))}
          </div>
          <div className="label" style={{ marginTop: 12 }}>
            {copy.home.diets}
          </div>
          <div className="row" style={{ gap: '2px 10px' }}>
            {shop.diets.map((x) => (
              <Opt
                key={x}
                small
                role="checkbox"
                pressed={diets.includes(x)}
                onClick={() => setDiets(toggle(diets, x))}
              >
                {copy.home.dietLabels[x] ?? x}
              </Opt>
            ))}
          </div>
          <div className="t-swaps">
            <h2 className="label">{c.swapsTitle}</h2>
            <p className="hint">{c.swaps}</p>
          </div>
        </aside>

        <div className="t-routes">
          {byMarket.length === 0 && <p className="status">{c.none}</p>}
          {byMarket.map((t) => {
            const market = shop.markets.find((m) => m.id === t.marketId)?.name ?? ''
            return (
              <section key={t.marketId} className="t-route" aria-label={c.route(market)}>
                <h2 className="sub">{c.route(market)}</h2>
                <RouteTastings shop={shop} themeId={t.id} allergens={allergens} diets={diets} />
              </section>
            )
          })}
        </div>
      </div>

      <div className="t-cta">
        <Brush href="/order" icon="flagStart">
          {c.cta}
        </Brush>
      </div>
    </main>
  )
}
