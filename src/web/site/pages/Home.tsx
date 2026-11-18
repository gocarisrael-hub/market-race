// Step 1: occasion, about whom, theme, people, allergens and diets, live price.
import { useState } from 'react'
import type { Shop } from '../api.ts'
import { copy } from '../copy.ts'
import {
  chooseOccasion,
  clampPeople,
  type Draft,
  formatShekels,
  formsFor,
  orderableThemes,
  priceAgorot,
  privateOccasions,
  step1Error,
  toggle,
} from '../logic.ts'
import { navigate } from '../router.ts'
import { Cta, Deco, Link, Opt, Ring, Underline } from '../ui.tsx'

export const STEPS = 4

export function Home(props: { shop: Shop; draft: Draft; setDraft: (d: Draft) => void }) {
  const { shop, draft: d, setDraft } = props
  const [error, setError] = useState<string | null>(null)
  const occasions = privateOccasions(shop)
  const occ = occasions.find((o) => o.key === d.occasionKey)
  const forms = formsFor(occ)
  const themes = orderableThemes(shop)
  const theme = themes.find((t) => t.id === d.themeId)
  const market = shop.markets.find((m) => m.id === (theme ?? themes[0])?.marketId)?.name ?? ''
  const total = priceAgorot(shop, d.occasionKey, d.people)
  const per = d.occasionKey ? shop.prices[d.occasionKey] : undefined
  const set = (patch: Partial<Draft>) => {
    setError(null)
    setDraft({ ...d, ...patch })
  }
  const [t1, t2] = copy.home.title(market)

  const next = () => {
    const e = step1Error(d, shop)
    if (e) return setError(e)
    navigate('/order/questions')
  }

  return (
    <main className="page">
      <Deco icon="awning" className="sway" style={{ top: -30, left: -36, width: 210 }} />
      <Deco
        icon="fruit"
        className="bob"
        style={{ top: 190, left: -44, width: 96, ['--r' as string]: '-10deg' }}
      />
      <Deco
        icon="spices"
        className="bob"
        style={{ top: 1100, left: -40, width: 90, animationDelay: '-2s' }}
      />

      <div style={{ marginTop: 74, marginLeft: 50 }}>
        <div className="eyebrow">{copy.stepOf(1, STEPS)}</div>
        <h1 className="title rise">
          {t1}
          <br />
          {t2}
        </h1>
        <p className="lead">{copy.home.intro}</p>
      </div>

      {occasions.length === 0 ? (
        <p className="status">{copy.home.noOccasions}</p>
      ) : (
        <>
          <section className="section" aria-labelledby="l-occ">
            <div className="label" id="l-occ">
              {copy.home.occasion}
            </div>
            <div className="row" role="radiogroup" aria-labelledby="l-occ">
              {occasions.map((o) => (
                <Opt
                  key={o.key}
                  role="radio"
                  pressed={d.occasionKey === o.key}
                  onClick={() => set(chooseOccasion(d, o))}
                >
                  {o.label}
                </Opt>
              ))}
            </div>
          </section>

          {forms.length > 0 && (
            <section className="section" aria-labelledby="l-form">
              <div className="label" id="l-form">
                {copy.home.about}
              </div>
              <div className="row" role="radiogroup" aria-labelledby="l-form">
                {forms.map((f) => (
                  <Opt key={f} role="radio" pressed={d.form === f} onClick={() => set({ form: f })}>
                    {copy.home.forms[f]}
                  </Opt>
                ))}
              </div>
            </section>
          )}

          <section className="section" aria-labelledby="l-theme">
            <div className="label" id="l-theme" style={{ marginBottom: 12 }}>
              {copy.home.theme}
            </div>
            <div className="themes">
              {themes.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  className="theme"
                  aria-pressed={d.themeId === t.id}
                  onClick={() => set({ themeId: t.id })}
                >
                  {t.map && <img src={t.map} alt="" loading="lazy" decoding="async" />}
                  <span className="name">
                    {t.name}
                    {d.themeId === t.id && (
                      <Ring
                        style={{ inset: '-4px -8px', width: 'calc(100% + 16px)', height: 'calc(100% + 8px)' }}
                      />
                    )}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="section" aria-labelledby="l-people">
            <div className="label" id="l-people">
              {copy.home.people}
            </div>
            <div className="stepper">
              <button
                type="button"
                aria-label={copy.home.less}
                disabled={d.people <= shop.minPeople}
                onClick={() => set({ people: clampPeople(d.people - 1, shop.minPeople, shop.maxPeople) })}
              >
                −
              </button>
              <output className="n" aria-live="polite" aria-labelledby="l-people">
                {d.people}
              </output>
              <button
                type="button"
                aria-label={copy.home.more}
                disabled={d.people >= shop.maxPeople}
                onClick={() => set({ people: clampPeople(d.people + 1, shop.minPeople, shop.maxPeople) })}
              >
                +
              </button>
              <span className="unit">{copy.home.peopleUnit(d.people)}</span>
            </div>
          </section>

          <section className="section" aria-labelledby="l-all">
            <div className="label" id="l-all">
              {copy.home.allergens}
            </div>
            <div className="row" style={{ gap: '2px 10px' }}>
              {shop.allergens.map((a) => (
                <Opt
                  key={a}
                  small
                  role="checkbox"
                  pressed={d.allergens.includes(a)}
                  onClick={() => set({ allergens: toggle(d.allergens, a) })}
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
                  pressed={d.diets.includes(x)}
                  onClick={() => set({ diets: toggle(d.diets, x) })}
                >
                  {copy.home.dietLabels[x] ?? x}
                </Opt>
              ))}
            </div>
            <p className="hint">{copy.home.allergensHint}</p>
          </section>

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

          <p className="section">
            <Link href="/companies">{copy.home.companies}</Link>
          </p>

          <Cta onClick={next} error={error}>
            {copy.home.next(d.form)}
          </Cta>
        </>
      )}
    </main>
  )
}
