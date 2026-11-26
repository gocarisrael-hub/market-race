// /: what the product is, in a few lines, then one choice between the two games. The tastings
// and the FAQ open in place. Prices, group size, validity and duration come from the settings.
import { Doodles } from '../../shared/decor.tsx'
import type { Shop } from '../api.ts'
import { copy } from '../copy.ts'
import {
  companyOccasions,
  formatShekels,
  fromPerPerson,
  orderableThemes,
  privateOccasions,
  routeForTheme,
} from '../logic.ts'
import { Brush, Deco, Fold } from '../ui.tsx'
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
  const products = [
    {
      key: 'private',
      ...c.products.private,
      href: '/order',
      from: fromPerPerson(shop, privateOccasions(shop)),
    },
    {
      key: 'company',
      ...c.products.company,
      href: '/companies',
      from: fromPerPerson(shop, companyOccasions(shop)),
    },
  ] as const

  return (
    <main className="page landing" data-decor="generic">
      <Deco icon="awning" className="sway" style={{ top: -30, left: -36, width: 210 }} />

      <header className="l-hero">
        <div className="l-hero-text">
          <p className="eyebrow">{c.eyebrow}</p>
          <h1 className="title rise">
            {t1}
            <br />
            {t2}
          </h1>
          <p className="lead">{c.lead}</p>
        </div>
        {theme?.map && (
          <figure className="l-hero-map">
            <Doodles
              decor="generic"
              spots={[
                { top: -20, right: '8%', size: 54, rot: 12 },
                { bottom: '12%', left: -26, size: 48, rot: -10 },
              ]}
            />
            <img src={theme.map} alt={c.mapAlt(theme.name)} />
          </figure>
        )}
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

      <section className="section l-choice" aria-labelledby="l-choice">
        <h2 className="sub" id="l-choice">
          {c.choiceTitle}
        </h2>
        <div className="l-products">
          {products.map((p) => (
            <article key={p.key} className={`l-product l-product-${p.key}`} aria-labelledby={`p-${p.key}`}>
              <Doodles decor="generic" spots={[{ top: -22, left: 14, size: 52, rot: -10 }]} />
              <svg
                className="l-product-paper"
                viewBox="0 0 300 300"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  d="M6 10 L 80 4 L 160 9 L 240 3 L 294 8 L 297 90 L 292 170 L 297 250 L 291 294 L 210 297 L 130 291 L 50 297 L 4 292 L 8 200 L 3 120 Z"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <h3 id={`p-${p.key}`}>{p.title}</h3>
              <p className="l-product-text">{p.text}</p>
              {p.from !== null && <p className="l-product-price">{c.from(formatShekels(p.from))}</p>}
              <Brush href={p.href} icon={p.key === 'private' ? 'flagStart' : 'briefcase'}>
                {p.cta}
              </Brush>
            </article>
          ))}
        </div>
      </section>

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
    </main>
  )
}
