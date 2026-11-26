// /: the private site's landing, only about celebrating a person. What the product is in a few
// lines beside the route teaser (the map with the tasting route, the stalls blurred), one call to
// action into the order, then how it works, the tastings and the FAQ folded. Companies have their
// own site; a quiet footer line links to it. Prices, group size, validity and duration come from
// the settings.
import { Doodles } from '../../shared/decor.tsx'
import type { Shop } from '../api.ts'
import { copy } from '../copy.ts'
import { formatShekels, fromPerPerson, orderableThemes, privateOccasions, routeForTheme } from '../logic.ts'
import { RouteTeaser } from '../RouteTeaser.tsx'
import { Brush, Deco, Fold, Link } from '../ui.tsx'
import { TastingsExplorer } from './Tastings.tsx'

// One food illustration (assets/icons) per step of "how it works".
const STEP_ICONS = ['spices', 'gate', 'falafel', 'flowers']

export function Landing({ shop }: { shop: Shop }) {
  const c = copy.landing
  const themes = orderableThemes(shop)
  const theme = themes[0]
  const market = shop.markets.find((m) => m.id === theme?.marketId)?.name ?? ''
  const [t1, t2] = copy.home.title(market)
  const route = routeForTheme(shop, theme?.id)
  const from = fromPerPerson(shop, privateOccasions(shop))

  return (
    <main className="page landing" data-decor="generic">
      <Deco icon="awning" className="sway" style={{ top: -30, left: -36, width: 210 }} />

      <header className="l-hero">
        <div className="l-hero-head">
          <p className="eyebrow">{c.eyebrow}</p>
          <h1 className="title rise">
            {t1}
            <br />
            {t2}
          </h1>
        </div>
        <div className="l-hero-map">
          <Doodles
            decor="generic"
            spots={[
              { top: -26, right: '4%', size: 50, rot: 12 },
              { bottom: '18%', left: -30, size: 44, rot: -10 },
            ]}
          />
          <RouteTeaser shop={shop} themeId={theme?.id ?? null} />
        </div>
        <div className="l-hero-body">
          <p className="lead">{c.lead}</p>
          <div className="l-cta">
            <Brush href="/order" icon="flagStart">
              {c.cta}
            </Brush>
            {from !== null && <p className="l-price">{c.from(formatShekels(from))}</p>}
          </div>
        </div>
      </header>

      <ol className="l-strip" aria-label={c.howLabel}>
        {c.steps.map((s, i) => (
          <li key={s.title}>
            <img src={`/static/icons/${STEP_ICONS[i]}.png`} alt="" />
            <span className="l-strip-text">
              <strong>
                {i + 1}. {s.title}
              </strong>
              <span>{s.text}</span>
            </span>
          </li>
        ))}
      </ol>

      <Fold title={c.tastingsTitle} icon="basket" className="l-tastings">
        <TastingsExplorer shop={shop} />
      </Fold>

      <Fold title={c.faqTitle} icon="question" className="l-faq">
        <dl>
          <dt>{c.faq.validity.q}</dt>
          <dd>{c.faq.validity.a(shop.validYears)}</dd>
          <dt>{c.faq.duration.q}</dt>
          <dd>{c.faq.duration.a(shop.gameDuration, route?.stops ?? 0)}</dd>
          <dt>{c.faq.allergies.q}</dt>
          <dd>{c.faq.allergies.a}</dd>
          <dt>{c.faq.people.q}</dt>
          <dd>{c.faq.people.a(shop.minPeople, shop.maxPeople)}</dd>
        </dl>
      </Fold>

      <footer className="l-footer">
        {c.footer.text}{' '}
        <Link href="/companies" className="l-footer-link">
          {c.footer.link}
        </Link>
      </footer>
    </main>
  )
}
