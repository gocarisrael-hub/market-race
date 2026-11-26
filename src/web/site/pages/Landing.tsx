// /: what the product is, for a first-time visitor. How it works, who it is for, what you get, a
// peek at the tastings, prices and a short FAQ, all from the shop (prices, people, validity and
// the duration are settings). The order itself starts at /order.
import { Doodle, Doodles, decorSet, Icon } from '../../shared/decor.tsx'
import type { Shop } from '../api.ts'
import { copy } from '../copy.ts'
import { formatShekels, orderableThemes, privateOccasions, routeForTheme } from '../logic.ts'
import { Brush, Deco, Link, SectionHead, SiteNav, Sketch, TornPaper, Underline } from '../ui.tsx'

// One food illustration (assets/icons) per step of "how it works".
const STEP_ICONS = ['spices', 'gate', 'falafel', 'flowers']
const PEEK = 3

export function Landing({ shop }: { shop: Shop }) {
  const c = copy.landing
  const themes = orderableThemes(shop)
  const theme = themes[0]
  const market = shop.markets.find((m) => m.id === theme?.marketId)?.name ?? ''
  const [t1, t2] = copy.home.title(market)
  const route = routeForTheme(shop, theme?.id)
  const occasions = privateOccasions(shop)
  const priced = occasions.filter((o) => shop.prices[o.key])

  return (
    <main className="page landing" data-decor="generic">
      <Deco icon="awning" className="sway" style={{ top: -30, left: -36, width: 210 }} />
      <SiteNav current="about" />

      <header className="l-hero">
        <div className="l-hero-text">
          <p className="eyebrow">{c.eyebrow}</p>
          <h1 className="title rise">
            {t1}
            <br />
            {t2}
          </h1>
          <p className="lead">{c.lead}</p>
          <div className="l-ctas">
            <Brush href="/order" icon="flagStart">
              {c.ctaOrder}
            </Brush>
            <Sketch href="/tastings" icon="basket">
              {c.ctaTastings}
            </Sketch>
          </div>
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

      <section className="section l-how" aria-labelledby="l-how">
        <SectionHead icon="map" id="l-how">
          {c.howTitle}
        </SectionHead>
        <ol className="l-steps">
          {c.steps.map((s, i) => (
            <li key={s.title} className="l-step">
              <img className="l-step-art bob" src={`/static/icons/${STEP_ICONS[i]}.png`} alt="" />
              <span className="l-step-no" aria-hidden="true">
                {i + 1}
              </span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {occasions.length > 0 && (
        <section className="section l-for" aria-labelledby="l-for">
          <SectionHead icon="heart" id="l-for">
            {c.forTitle}
          </SectionHead>
          <ul className="l-occasions">
            {occasions.map((o) => (
              <li key={o.key}>
                <Doodle name={decorSet(o.decor)[0]} className="l-occ-doodle" />
                <span>{o.label}</span>
              </li>
            ))}
            <li>
              <Link href="/companies" className="l-occ-link">
                <Doodle name="briefcase" className="l-occ-doodle" />
                <span>{c.forCompanies}</span>
              </Link>
            </li>
          </ul>
        </section>
      )}

      <div className="l-pair">
        <TornPaper tilt="r">
          <h2 className="sub section-head">
            <Icon name="gift" size={40} tilt={-6} />
            <span>{c.getTitle}</span>
          </h2>
          <ul className="l-get">
            {c.get.map((g) => (
              <li key={g}>
                <Icon name="check" size={26} />
                <span>{g}</span>
              </li>
            ))}
          </ul>
        </TornPaper>

        {route && route.tastings.length > 0 && (
          <TornPaper tilt="l">
            <h2 className="sub section-head">
              <Icon name="basket" size={40} tilt={-6} />
              <span>{c.peekTitle}</span>
            </h2>
            <ul className="l-peek" data-testid="tastings-peek">
              {route.tastings.slice(0, PEEK).map((t, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: stops are positional
                <li key={i}>
                  {t.icon && <img src={t.icon} alt="" loading="lazy" />}
                  <span>{t.teaser || copy.home.tastingFallback}</span>
                </li>
              ))}
            </ul>
            <Sketch href="/tastings" small icon="basket">
              {c.peekMore}
            </Sketch>
          </TornPaper>
        )}
      </div>

      {priced.length > 0 && (
        <section className="section l-prices" aria-labelledby="l-prices" data-testid="landing-prices">
          <SectionHead icon="ticket" id="l-prices">
            {c.pricesTitle}
          </SectionHead>
          <ul>
            {priced.map((o) => {
              const p = shop.prices[o.key]
              const parts = [
                p.base > 0 ? c.priceBase(formatShekels(p.base)) : null,
                p.perPerson > 0 ? c.pricePer(formatShekels(p.perPerson)) : null,
              ].filter(Boolean)
              return (
                <li key={o.key}>
                  <span className="l-price-name">{o.label}</span>
                  <span className="l-price">{parts.join(c.priceJoin)}</span>
                </li>
              )
            })}
          </ul>
          <p className="hint">{c.pricesHint}</p>
        </section>
      )}

      <section className="section l-faq" aria-labelledby="l-faq">
        <SectionHead icon="question" id="l-faq">
          {c.faqTitle}
        </SectionHead>
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
      </section>

      <section className="section l-closing">
        <h2 className="sub">
          {c.closingTitle}
          <Underline />
        </h2>
        <p className="lead">{c.closingText}</p>
        <Brush href="/order" icon="flagStart">
          {c.ctaOrder}
        </Brush>
      </section>
      <Deco
        icon="spices"
        className="bob"
        style={{ bottom: 10, left: -24, width: 90, ['--r' as string]: '10deg' }}
      />
    </main>
  )
}
