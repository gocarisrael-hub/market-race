// The companies site: /companies, or / on a domain listed in COMPANY_HOSTS. Its own landing, look
// and layout (no private site nav): team events in the market, the company's logo and colours on
// the map, the group size range from the settings, and the lead form. Companies don't order on the
// site; they leave a lead, and the owner sends a quote with a payment link (/pay/:token).
import { type CSSProperties, useState } from 'react'
import { type DoodleName, Doodles, Icon } from '../../shared/decor.tsx'
import { ApiError, type Shop, sendLead } from '../api.ts'
import { copy } from '../copy.ts'
import {
  companyOccasions,
  errorText,
  type Lead,
  leadErrors,
  orderableThemes,
  routeForTheme,
  type Site,
} from '../logic.ts'
import { Brush, Cta, Field, Opt, Ring, Underline } from '../ui.tsx'

/** The company colours the map is shown in: an example, as a company would choose them. */
const SAMPLE = { ink: '#1d3f7a', sun: '#f2b632', leaf: '#2f8f83' }

const ROUTE =
  'M84 16 C 70 8, 56 22, 42 17 S 14 14, 16 32 C 18 48, 40 46, 54 50 S 86 56, 82 72 C 78 86, 54 80, 40 84 S 18 90, 12 88'

const toLead = () => document.getElementById('lead')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

export function Companies({ shop, site }: { shop: Shop; site: Site }) {
  const c = copy.companiesSite
  const themes = orderableThemes(shop)
  const theme = themes[0]
  const market = shop.markets.find((m) => m.id === theme?.marketId)?.name ?? ''
  const route = routeForTheme(shop, theme?.id)
  const people = shop.companyPeople ?? { min: shop.minPeople, max: shop.maxPeople }
  const home = site.kind === 'companies' ? site.privateHome : '/'

  return (
    <div className="co" data-decor="company">
      <header className="co-bar">
        <span className="co-brand">{c.brand(shop.brand)}</span>
        <a className="co-bar-link" href="#lead">
          {c.toForm}
        </a>
      </header>

      <main className="co-main">
        <section className="co-hero" aria-labelledby="co-title">
          <div className="co-hero-text">
            <p className="co-eyebrow">{c.eyebrow}</p>
            <h1 className="co-title rise" id="co-title">
              {c.title[0]}
              <br />
              <span className="co-title-2">
                {c.title[1]}
                <Underline />
              </span>
            </h1>
            <p className="co-lead">{c.lead}</p>
            <div className="co-cta">
              <Brush onClick={toLead} icon="briefcase">
                {c.cta}
              </Brush>
            </div>
            <dl className="co-facts">
              <div>
                <dt>{c.people(people.min, people.max)}</dt>
                <dd>{c.peopleUnit}</dd>
              </div>
              {route && route.stops > 0 && (
                <div>
                  <dt>{c.stops(route.stops)}</dt>
                  <dd>{c.stopsUnit}</dd>
                </div>
              )}
              {market && (
                <div>
                  <dt>{c.market(market)}</dt>
                  <dd>{c.marketUnit}</dd>
                </div>
              )}
            </dl>
          </div>

          {theme?.map && (
            <figure
              className="co-map"
              style={{ '--co-ink': SAMPLE.ink, '--co-sun': SAMPLE.sun } as CSSProperties}
            >
              <Doodles
                decor="company"
                spots={[
                  { top: -30, left: '10%', size: 54, rot: -10 },
                  { bottom: '16%', right: -28, size: 48, rot: 12 },
                ]}
              />
              <div className="co-map-paper">
                <img src={theme.map} alt={c.mapAlt(market)} decoding="async" />
                <span className="co-map-tint" aria-hidden="true" />
                <svg
                  className="co-map-route"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path d={ROUTE} />
                </svg>
                <span className="co-stamp" aria-hidden="true">
                  <Icon name="briefcase" size={30} />
                  <span>{c.logo}</span>
                </span>
              </div>
              <figcaption className="co-swatches">
                <span className="co-swatch-row" aria-hidden="true">
                  {Object.values(SAMPLE).map((col) => (
                    <span key={col} className="co-swatch" style={{ background: col }} />
                  ))}
                </span>
                {c.swatches}
              </figcaption>
            </figure>
          )}
        </section>

        <section className="co-features" aria-labelledby="co-features">
          <h2 className="co-h2" id="co-features">
            {c.featuresTitle}
          </h2>
          <ul>
            {c.features.map((f) => (
              <li key={f.title}>
                <Icon name={f.icon as DoodleName} size={54} tilt={-6} />
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="co-how" aria-labelledby="co-how">
          <h2 className="co-h2" id="co-how">
            {c.howTitle}
          </h2>
          <ol>
            {c.how.map((s, i) => (
              <li key={s.title}>
                <span className="co-how-no">
                  {i + 1}
                  <Ring />
                </span>
                <strong>{s.title}</strong>
                <span>{s.text}</span>
              </li>
            ))}
          </ol>
        </section>

        <LeadForm shop={shop} people={people} />
      </main>

      <footer className="co-foot">
        {c.footer.text}{' '}
        <a href={home} className="co-foot-link">
          {c.footer.link}
        </a>
      </footer>
    </div>
  )
}

function LeadForm({ shop, people }: { shop: Shop; people: { min: number; max: number } }) {
  const c = copy.companiesSite
  const [lead, setLead] = useState<Lead>({
    companyName: '',
    contactName: '',
    phone: '',
    email: '',
    occasionKey: null,
    people: '',
    preferredDate: '',
    message: '',
  })
  const [errors, setErrors] = useState<ReturnType<typeof leadErrors>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const set = (k: keyof Lead, v: string | null) => {
    setErrors({})
    setError(null)
    setLead({ ...lead, [k]: v })
  }

  const submit = async () => {
    const e = leadErrors(lead)
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    try {
      await sendLead({
        companyName: lead.companyName.trim(),
        contactName: lead.contactName.trim(),
        phone: lead.phone.trim(),
        email: lead.email.trim(),
        ...(lead.occasionKey ? { occasionKey: lead.occasionKey } : {}),
        ...(lead.people.trim() ? { people: Number(lead.people) } : {}),
        preferredDate: lead.preferredDate.trim(),
        message: lead.message.trim(),
      })
      setSent(true)
      document.getElementById('lead')?.scrollIntoView({ block: 'start' })
    } catch (err) {
      setError(errorText(err instanceof ApiError ? err.code : 'generic'))
    } finally {
      setBusy(false)
    }
  }

  const occasions = companyOccasions(shop)
  if (sent) {
    const [a, b] = copy.companies.thanks
    return (
      <section className="co-form co-thanks" id="lead" aria-labelledby="co-thanks">
        <h2 className="co-h2" id="co-thanks">
          {a}
        </h2>
        <p className="status" role="status">
          {b}
        </p>
      </section>
    )
  }

  return (
    <section className="co-form" id="lead" aria-labelledby="co-form">
      <div className="co-form-head">
        <h2 className="co-h2" id="co-form">
          {c.formTitle[0]} {c.formTitle[1]}
        </h2>
        <p className="co-lead">{c.formIntro}</p>
      </div>
      <div className="co-form-body">
        {occasions.length > 0 && (
          <div className="co-occ">
            <div className="label" id="co-occ">
              {copy.companies.occasion}
            </div>
            <div className="row" role="radiogroup" aria-labelledby="co-occ">
              {occasions.map((o) => (
                <Opt
                  key={o.key}
                  role="radio"
                  pressed={lead.occasionKey === o.key}
                  onClick={() => set('occasionKey', lead.occasionKey === o.key ? null : o.key)}
                >
                  {o.label}
                </Opt>
              ))}
            </div>
          </div>
        )}
        <div className="co-fields">
          <Field
            label={copy.companies.companyName}
            value={lead.companyName}
            autoComplete="organization"
            error={errors.companyName}
            onChange={(v) => set('companyName', v)}
          />
          <Field
            label={copy.companies.contactName}
            value={lead.contactName}
            autoComplete="name"
            error={errors.contactName}
            onChange={(v) => set('contactName', v)}
          />
          <Field
            label={copy.companies.phone}
            value={lead.phone}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            ltr
            error={errors.phone}
            onChange={(v) => set('phone', v)}
          />
          <Field
            label={copy.companies.email}
            value={lead.email}
            type="email"
            inputMode="email"
            autoComplete="email"
            ltr
            error={errors.email}
            onChange={(v) => set('email', v)}
          />
          <Field
            label={copy.companies.people}
            value={lead.people}
            inputMode="numeric"
            placeholder={c.peopleHint(people.min, people.max)}
            error={errors.people}
            onChange={(v) => set('people', v)}
          />
          <Field
            label={copy.companies.date}
            value={lead.preferredDate}
            placeholder={copy.companies.datePlaceholder}
            onChange={(v) => set('preferredDate', v)}
          />
        </div>
        <Field
          label={copy.companies.message}
          value={lead.message}
          multiline
          onChange={(v) => set('message', v)}
        />
        <Cta onClick={submit} busy={busy} error={error}>
          {copy.companies.submit}
        </Cta>
      </div>
    </section>
  )
}
