// The screens of the order build, one decision (or a small group) each. The shell (Build.tsx)
// draws the progress map, the transitions and the back/next buttons; these draw the question.
import { type ReactNode, useEffect } from 'react'
import { LibIcon } from '../../shared/icon.tsx'
import type { Photo, Question, Shop } from '../api.ts'
import { copy, type SiteForm, type SiteRecipient } from '../copy.ts'
import { HintQuestions } from '../hintQuestions.tsx'
import {
  type buyerErrors,
  chooseOccasion,
  chooseTheme,
  clampPeople,
  currentPalette,
  type Draft,
  decorFor,
  formatShekels,
  formChoice,
  MAX_NOTES,
  nameLabel,
  orderableThemes,
  palettesFor,
  priceAgorot,
  privateOccasions,
  recipientLabel,
  recipientsFor,
  themesForDraft,
  toggle,
  withOfferedTheme,
  withRecipient,
} from '../logic.ts'
import { BuyerFields } from '../pages/Checkout.tsx'
import { PhotosPanel } from '../photos-panel.tsx'
import type { StageKey } from '../stages.ts'
import { RouteTastings } from '../tastings.tsx'
import {
  Daub,
  LookPreview,
  Opt,
  QField,
  QNote,
  Ring,
  Sketch,
  ThemeThumb,
  Tick,
  TornPaper,
  Underline,
} from '../ui.tsx'
import { occasionIcon, questionIcon, recipientIcon, STAGE_ICONS } from './art.ts'

export type StageProps = {
  shop: Shop
  d: Draft
  /** Patches the draft (and clears the stage's error). */
  set: (patch: Partial<Draft>) => void
  questions: Question[]
  /** The questions of this part (questions stage only). */
  asked: Question[]
  part: number
  parts: number
  form: SiteForm | null
  recipient: SiteRecipient | null
  token: string | null
  wide: boolean
  onPhotos: (photos: Photo[]) => void
  buyerErrors: ReturnType<typeof buyerErrors>
}

export const TITLE_ID = 'stage-title'

/** The top of a stage: a short encouraging line, the question, and an optional lead. */
export function StageHead(props: {
  /** The stage, for its icon by the title. */
  stage?: StageKey
  cheer?: ReactNode
  title: ReactNode
  lead?: ReactNode
  count?: string
}) {
  const icon = props.stage ? STAGE_ICONS[props.stage] : undefined
  return (
    <header className="stage-head">
      {props.count && <p className="stage-count">{props.count}</p>}
      {props.cheer && <p className="stage-cheer">{props.cheer}</p>}
      <h1 className="title stage-title" id={TITLE_ID} tabIndex={-1}>
        {props.title}
        {icon && <LibIcon key={icon} icon={icon} size={48} tilt={-8} className="stage-art pop" eager />}
      </h1>
      {props.lead && <p className="lead">{props.lead}</p>}
    </header>
  )
}

export function OccasionStage({ shop, d, set }: StageProps) {
  const occasions = privateOccasions(shop)
  const themes = orderableThemes(shop)
  const market =
    shop.markets.find((m) => m.id === (themes.find((t) => t.id === d.themeId) ?? themes[0])?.marketId)
      ?.name ?? ''
  const decor = decorFor(shop, d.occasionKey)
  return (
    <>
      <StageHead
        stage="occasion"
        cheer={copy.build.cheer.occasion(market)}
        title={copy.build.title.occasion}
        lead={copy.home.intro}
      />
      {occasions.length === 0 ? (
        <p className="status">{copy.home.noOccasions}</p>
      ) : (
        <div className="row stage-options occasion-options" role="radiogroup" aria-labelledby={TITLE_ID}>
          {occasions.map((o) => (
            <Opt
              key={o.key}
              role="radio"
              icon={occasionIcon(o)}
              pressed={d.occasionKey === o.key}
              onClick={() => set(chooseOccasion(d, o))}
            >
              {o.label}
            </Opt>
          ))}
        </div>
      )}
      {decor && (
        <p className="cheer" aria-live="polite" key={decor}>
          {copy.cheer[decor] ?? copy.cheer.generic}
        </p>
      )}
    </>
  )
}

export function ForStage({ shop, d, set, recipient }: StageProps) {
  const occ = shop.occasions.find((o) => o.key === d.occasionKey)
  const recipients = recipientsFor(occ)
  return (
    <>
      <StageHead stage="for" cheer={copy.build.cheer.for} title={copy.build.title.for} />
      <div className="row recipients stage-options" role="radiogroup" aria-labelledby={TITLE_ID}>
        {recipients.map((r) => (
          <Opt
            key={r}
            role="radio"
            // One person (her or him) is the usual gift: drawn larger.
            small={r !== 'she' && r !== 'he'}
            icon={recipientIcon(r, occ?.decor) ?? undefined}
            pressed={recipient === r}
            onClick={() => set(withRecipient(d, r))}
          >
            {recipientLabel(occ, r)}
          </Opt>
        ))}
      </div>
      {(recipients.includes('she') || recipients.includes('he')) && (
        <p className="hint">{copy.home.recipientHint}</p>
      )}
    </>
  )
}

export function NameStage({ shop, d, set, questions, form, recipient }: StageProps) {
  const forms = formChoice(shop, d)
  const label = nameLabel(questions, form)
  const n = [...d.honoreeName].length
  return (
    <>
      <StageHead stage="name" cheer={copy.build.cheer.name} title={label} />
      {forms.length > 0 && (
        <div className="row form-choice" role="radiogroup" aria-label={copy.questions.formLabel}>
          {forms.map((f) => (
            <Opt
              key={f}
              small
              role="radio"
              pressed={recipient === f}
              onClick={() => set(withRecipient(d, f))}
            >
              {copy.questions.forms[f]}
            </Opt>
          ))}
        </div>
      )}
      <label className="q name-field">
        <span className="sr-only">{label}</span>
        <input
          name="honoreeName"
          value={d.honoreeName}
          placeholder={copy.questions.namePlaceholder(form, recipient)}
          autoComplete="off"
          enterKeyHint="next"
          aria-invalid={n > 40 || undefined}
          onChange={(e) => set({ honoreeName: e.target.value })}
        />
        <span className={n > 40 ? 'count over' : 'count'} aria-hidden="true">
          {n}/40
        </span>
      </label>
    </>
  )
}

export function LookStage({ shop, d, set, wide }: StageProps) {
  // Only the styles offered for this occasion (and who it is for), as illustrated thumbnails.
  const themes = themesForDraft(shop, d)
  const theme = themes.find((t) => t.id === d.themeId)
  const pals = palettesFor(shop, theme?.id)
  const pal = currentPalette(shop, d)
  useEffect(() => {
    const fixed = withOfferedTheme(shop, d)
    if (fixed !== d) set({ themeId: fixed.themeId, paletteId: fixed.paletteId })
  }, [shop, d, set])
  return (
    <>
      <StageHead stage="look" cheer={copy.build.cheer.look} title={copy.build.title.look} />
      <fieldset className="themes plain-set" aria-labelledby={TITLE_ID}>
        {themes.map((t) => {
          const on = d.themeId === t.id
          return (
            <button
              type="button"
              key={t.id}
              className="theme"
              data-theme={t.key ?? t.id}
              aria-pressed={on}
              onClick={() => set(chooseTheme(shop, d, t.id))}
            >
              <ThemeThumb
                map={t.map}
                palette={on && pal ? pal.palette : t.palette}
                style={on && pal ? { ...t.style, colors: undefined } : t.style}
                tint={on ? pal?.palette.mapTint : undefined}
              />
              <span className="name">
                {t.name}
                {on && (
                  <Ring
                    style={{ inset: '-4px -8px', width: 'calc(100% + 16px)', height: 'calc(100% + 8px)' }}
                  />
                )}
              </span>
            </button>
          )
        })}
      </fieldset>
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
          <p className="hint">{copy.home.paletteHint}</p>
        </section>
      )}
      {/* Phones see the opening in this style here; computers see it on the map beside. */}
      {theme && !wide && (
        <LookPreview
          map={theme.map}
          palette={pal?.palette ?? theme.palette}
          style={pal ? { ...theme.style, colors: undefined } : theme.style}
          name={pal ? `${theme.name} · ${pal.name}` : theme.name}
        />
      )}
    </>
  )
}

export function QuestionsStage({ d, set, asked, part, parts, form }: StageProps) {
  return (
    <>
      <StageHead
        stage="questions"
        count={parts > 1 ? copy.build.questionsPart(part, parts) : undefined}
        cheer={part === 1 ? copy.build.cheer.questions(form) : copy.build.cheer.questionsMore}
        title={copy.questions.title(form).join(' ')}
        lead={part === 1 ? copy.questions.intro : undefined}
      />
      {!d.answersLater && (
        <div className="section">
          {asked.map((q, i) => (
            <QField
              paper={i % 2 ? -0.9 : 1.1}
              key={q.slot}
              name={q.slot}
              icon={questionIcon(q.slot) ?? undefined}
              label={q.text}
              placeholder={copy.questions.example(q.example)}
              value={d.answers[q.slot] ?? ''}
              onChange={(v) => set({ answers: { ...d.answers, [q.slot]: v } })}
              maxLen={q.maxLen || undefined}
              required={q.required}
            />
          ))}
        </div>
      )}
      {part === 1 && (
        <div className="section">
          <Opt
            role="checkbox"
            small
            pressed={d.answersLater}
            onClick={() => set({ answersLater: !d.answersLater })}
          >
            {copy.questions.later}
          </Opt>
          {d.answersLater && <p className="hint">{copy.questions.laterHint}</p>}
        </div>
      )}
    </>
  )
}

export function PhotosStage({ form, token, onPhotos }: StageProps) {
  return (
    <>
      <StageHead
        stage="photos"
        cheer={copy.build.cheer.photos}
        title={copy.photos.title(form)}
        lead={copy.photos.intro}
      />
      <p className="hint">{copy.photos.bgHint}</p>
      <p className="photos-where">
        {copy.photos.where}
        <span className="hint"> {copy.photos.order}</span>
      </p>
      {token && <PhotosPanel token={token} onPhotos={onPhotos} />}
    </>
  )
}

export function NotesStage({ d, set }: StageProps) {
  const notes = d.letterNotes.length ? d.letterNotes : [{ text: '', signature: '' }]
  const setNote = (i: number, patch: Partial<(typeof notes)[number]>) =>
    set({ letterNotes: notes.map((n, j) => (j === i ? { ...n, ...patch } : n)) })
  return (
    <>
      <StageHead
        stage="notes"
        cheer={copy.build.cheer.notes}
        title={copy.questions.notes}
        lead={`${copy.questions.notesHint} (${copy.optional})`}
      />
      <TornPaper tilt="r">
        {notes.map((n, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: notes have no id; order is stable
          <div className="note" key={i}>
            <QField
              label={copy.questions.noteText}
              value={n.text}
              multiline
              maxLen={600}
              onChange={(v) => setNote(i, { text: v })}
            />
            <QField
              label={copy.questions.noteSignature}
              value={n.signature}
              maxLen={60}
              onChange={(v) => setNote(i, { signature: v })}
            />
            {d.letterNotes.length > 1 && (
              <Sketch
                small
                icon="scissors"
                onClick={() => set({ letterNotes: d.letterNotes.filter((_, j) => j !== i) })}
              >
                {copy.questions.removeNote}
              </Sketch>
            )}
          </div>
        ))}
        {notes.length < MAX_NOTES && (
          <Sketch
            className="add-note"
            onClick={() => set({ letterNotes: [...notes, { text: '', signature: '' }] })}
          >
            {copy.questions.addNote}
          </Sketch>
        )}
      </TornPaper>
    </>
  )
}

export function HintsStage({ d, set, form }: StageProps) {
  return (
    <>
      <StageHead
        stage="hints"
        cheer={copy.build.cheer.hints}
        title={copy.hintQuestions.title}
        lead={`${copy.hintQuestions.intro(form)} (${copy.optional})`}
      />
      <HintQuestions
        bare
        form={form}
        value={d.hintQuestions ?? []}
        onChange={(hintQuestions) => set({ hintQuestions })}
      />
    </>
  )
}

export function PeopleStage({ shop, d, set, wide }: StageProps) {
  const total = priceAgorot(shop, d.occasionKey, d.people)
  const per = d.occasionKey ? shop.prices[d.occasionKey] : undefined
  return (
    <>
      <StageHead stage="people" cheer={copy.build.cheer.people} title={copy.home.people} />
      <div className="stepper stage-stepper">
        <button
          type="button"
          aria-label={copy.home.less}
          disabled={d.people <= shop.minPeople}
          onClick={() => set({ people: clampPeople(d.people - 1, shop.minPeople, shop.maxPeople) })}
        >
          −
        </button>
        <output className="n" aria-live="polite" aria-labelledby={TITLE_ID}>
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
      {/* Computers show the price on the map beside. */}
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
    </>
  )
}

export function DietStage({ shop, d, set }: StageProps) {
  return (
    <>
      <StageHead
        stage="diet"
        cheer={copy.build.cheer.diet}
        title={copy.home.allergens}
        lead={copy.home.allergensHint}
      />
      <fieldset className="row plain-set" aria-labelledby={TITLE_ID} style={{ gap: '2px 10px' }}>
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
      </fieldset>
      <div className="label" id="l-diets" style={{ marginTop: 14 }}>
        {copy.home.diets}
      </div>
      <fieldset className="row plain-set" aria-labelledby="l-diets" style={{ gap: '2px 10px' }}>
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
      </fieldset>
      <RouteTastings
        shop={shop}
        themeId={d.themeId}
        allergens={d.allergens}
        diets={d.diets}
        occasionKey={d.occasionKey}
      />
    </>
  )
}

export function DetailsStage({ d, set, buyerErrors }: StageProps) {
  return (
    <>
      <StageHead
        stage="details"
        cheer={copy.build.cheer.details}
        title={copy.build.title.details}
        lead={copy.build.detailsLead}
      />
      <BuyerFields
        buyer={d.buyer}
        errors={buyerErrors}
        onChange={(k, v) => set({ buyer: { ...d.buyer, [k]: v } })}
      />
    </>
  )
}
