// Step 1: which game (the occasion) and who it is for (one person first), theme, people,
// allergens and diets, live price. The recipient picks the questions of step 2.
import { useState } from 'react'
import { Doodles } from '../../shared/decor.tsx'
import { useWide } from '../../shared/useWide.ts'
import type { Shop } from '../api.ts'
import { copy } from '../copy.ts'
import {
  chooseOccasion,
  chooseTheme,
  clampPeople,
  currentPalette,
  type Draft,
  decorFor,
  draftRecipient,
  formatShekels,
  orderableThemes,
  palettesFor,
  priceAgorot,
  privateOccasions,
  recipientsFor,
  step1Error,
  toggle,
  withRecipient,
} from '../logic.ts'
import { OrderSide } from '../order-side.tsx'
import { navigate } from '../router.ts'
import { RouteTastings } from '../tastings.tsx'
import {
  Cta,
  Daub,
  Deco,
  LookPreview,
  Opt,
  QNote,
  Ring,
  Sketch,
  StepTrail,
  Tick,
  TitleIcon,
  Underline,
} from '../ui.tsx'

export const STEPS = 4

export function Home(props: { shop: Shop; draft: Draft; setDraft: (d: Draft) => void }) {
  const { shop, draft: d, setDraft } = props
  const [error, setError] = useState<string | null>(null)
  const occasions = privateOccasions(shop)
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
  const decor = decorFor(shop, d.occasionKey)
  const pals = palettesFor(shop, theme?.id)
  const pal = currentPalette(shop, d)
  const recipients = recipientsFor(occasions.find((o) => o.key === d.occasionKey))
  const recipient = draftRecipient(shop, d)
  // Wide screens show the preview, the tastings and the price in the side panel instead.
  const wide = useWide()

  const next = () => {
    const e = step1Error(d, shop)
    if (e) return setError(e)
    navigate('/order/questions')
  }

  return (
    <main className="page" data-decor={decor ?? undefined}>
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

      {decor && (
        <Doodles
          key={decor}
          className="deco"
          decor={decor}
          spots={[
            { top: 200, left: 6, size: 50, rot: 10 },
            { top: 560, left: 0, size: 44, rot: -12 },
            { top: 960, right: 0, size: 42, rot: 8 },
          ]}
        />
      )}

      <OrderSide shop={shop} draft={d} />

      <div className="page-head" style={{ marginTop: 74, marginLeft: 50 }}>
        <StepTrail step={1} total={STEPS} />
        <div className="title-row">
          <h1 className="title rise">
            {t1}
            <br />
            {t2}
          </h1>
          <TitleIcon icon="flagStart" />
        </div>
        <p className="lead">{copy.home.intro}</p>
      </div>

      {occasions.length === 0 ? (
        <p className="status">{copy.home.noOccasions}</p>
      ) : (
        <>
          <section className="section" aria-labelledby="l-occ">
            <QNote id="l-occ" tilt={-1.5} icon="gift">
              {copy.home.occasion}
            </QNote>
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
            {decor && (
              <p className="cheer" aria-live="polite" key={decor}>
                {copy.cheer[decor] ?? copy.cheer.generic}
              </p>
            )}
          </section>

          {recipients.length > 1 && (
            <section className="section" aria-labelledby="l-rcp">
              <QNote id="l-rcp" tilt={1.2} icon="heart">
                {copy.home.recipient}
              </QNote>
              <div className="row recipients" role="radiogroup" aria-labelledby="l-rcp">
                {recipients.map((r) => (
                  <Opt
                    key={r}
                    role="radio"
                    // One person (her or him) is the usual gift: drawn larger, and picked first.
                    small={r !== 'she' && r !== 'he'}
                    pressed={recipient === r}
                    onClick={() => set(withRecipient(d, r))}
                  >
                    {copy.home.recipients[r]}
                  </Opt>
                ))}
              </div>
              {(recipients.includes('she') || recipients.includes('he')) && (
                <p className="hint">{copy.home.recipientHint}</p>
              )}
            </section>
          )}

          <section className="section" aria-labelledby="l-theme">
            <QNote id="l-theme" tilt={-1} icon="map">
              {copy.home.theme}
            </QNote>
            <div className="themes">
              {themes.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  className="theme"
                  aria-pressed={d.themeId === t.id}
                  onClick={() => set(chooseTheme(shop, d, t.id))}
                >
                  <span className="thumb">
                    {t.map && <img src={t.map} alt="" loading="lazy" decoding="async" />}
                    {d.themeId === t.id && pal?.palette.mapTint && (
                      <span className="map-tint" style={{ background: pal.palette.mapTint }} />
                    )}
                  </span>
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

          {theme && pals.length > 0 && (
            <section className="section" aria-labelledby="l-palette">
              <QNote id="l-palette" tilt={1.4} icon="palette">
                {copy.home.palette}
              </QNote>
              <div className="daubs" role="radiogroup" aria-labelledby="l-palette">
                {pals.map((p, i) => {
                  const on = pal?.id === p.id
                  return (
                    // biome-ignore lint/a11y/useSemanticElements: a drawn daub, like the other drawn options
                    <button
                      type="button"
                      key={p.id}
                      role="radio"
                      aria-checked={on}
                      aria-label={p.name}
                      className="daub"
                      data-palette={p.id}
                      onClick={() => set({ paletteId: p.id })}
                    >
                      <Daub palette={p.palette} index={i} />
                      {on && <Ring />}
                      {on && <Tick />}
                    </button>
                  )
                })}
              </div>
              {pal && (
                <p className="daub-name" aria-live="polite">
                  {pal.name}
                </p>
              )}
              {pal && !wide && <LookPreview map={theme.map} palette={pal.palette} name={pal.name} />}
              <p className="hint">{copy.home.paletteHint}</p>
            </section>
          )}

          <section className="section" aria-labelledby="l-people">
            <QNote id="l-people" tilt={-1.2} icon="people">
              {copy.home.people}
            </QNote>
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
            <QNote id="l-all" tilt={1} icon="plate">
              {copy.home.allergens}
            </QNote>
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

          {!wide && (
            <RouteTastings
              shop={shop}
              themeId={theme?.id ?? themes[0]?.id ?? null}
              allergens={d.allergens}
              diets={d.diets}
            />
          )}

          {!wide && total !== null && per && (
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
            <Sketch href="/companies" icon="briefcase" small>
              {copy.home.companies}
            </Sketch>
          </p>
          <p className="section lost-link-entry">
            <Sketch href="/lost-link" icon="magnifier" small>
              {copy.lostLink.entry}
            </Sketch>
          </p>

          <Cta onClick={next} error={error}>
            {copy.home.next(recipient ? d.form : null)}
          </Cta>
        </>
      )}
    </main>
  )
}
