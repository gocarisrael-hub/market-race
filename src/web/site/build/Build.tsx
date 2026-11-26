// The order as a guided build (/order and its stages): one short stage per screen, the game
// visibly built on the map as the buyer goes, back and next on every stage. The draft is saved on
// every change (main.tsx); the order is created on the server when the questions are done (the
// photos need it) and updated whenever a later stage changes it.
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react'
import { Doodles } from '../../shared/decor.tsx'
import { useWide } from '../../shared/useWide.ts'
import {
  ApiError,
  createOrder,
  getManage,
  getQuestions,
  listPhotos,
  type Manage,
  type Photo,
  type Question,
  type Shop,
  updateOrder,
} from '../api.ts'
import { copy } from '../copy.ts'
import {
  askedQuestions,
  buyerErrors,
  cleanHintQuestions,
  cleanNotes,
  clearDraft,
  type Draft,
  decorFor,
  draftRecipient,
  errorText,
  formatShekels,
  formChoice,
  orderPayload,
  payloadKey,
  RECIPIENT_FORM,
  saveAction,
  step1Error,
  step2Error,
  withOfferedTheme,
  withRecipient,
} from '../logic.ts'
import { PayLayer, usePay } from '../pay.tsx'
import { navigate } from '../router.ts'
import {
  buildStages,
  createsOrder,
  findStage,
  gateStage,
  needsQuestions,
  questionParts,
  SAVES_ORDER,
  type Stage,
  type StageKey,
  stageError,
  stagePath,
} from '../stages.ts'
import { OrderSummary } from '../summary.tsx'
import { Cta, Deco, Failed, SiteNav, Sketch, Spinner } from '../ui.tsx'
import { BuildMap } from './BuildMap.tsx'
import {
  DetailsStage,
  DietStage,
  ForStage,
  HintsStage,
  LookStage,
  NameStage,
  NotesStage,
  OccasionStage,
  PeopleStage,
  PhotosStage,
  QuestionsStage,
  StageHead,
  type StageProps,
  TITLE_ID,
} from './stages.tsx'

const SCREENS: Record<Exclude<StageKey, 'pay'>, (p: StageProps) => ReactNode> = {
  occasion: OccasionStage,
  for: ForStage,
  name: NameStage,
  look: LookStage,
  questions: QuestionsStage,
  photos: PhotosStage,
  notes: NotesStage,
  hints: HintsStage,
  people: PeopleStage,
  diet: DietStage,
  details: DetailsStage,
}

/** A little market illustration in the margin of each stage. */
const MARGIN: Record<StageKey, { icon: string; style: CSSProperties; className: string }> = {
  occasion: { icon: 'awning', className: 'sway', style: { top: -30, left: -36, width: 210 } },
  for: { icon: 'flowers', className: 'sway', style: { top: 200, left: -34, width: 70 } },
  name: { icon: 'falafel', className: 'bob', style: { top: 210, left: -50, width: 112 } },
  look: { icon: 'spices', className: 'bob', style: { top: 200, left: -44, width: 90 } },
  questions: { icon: 'falafel', className: 'bob', style: { top: 210, left: -50, width: 112 } },
  photos: { icon: 'coffee', className: 'bob', style: { top: 200, left: -18, width: 66 } },
  notes: { icon: 'flowers', className: 'sway', style: { top: 200, left: -34, width: 70 } },
  hints: { icon: 'spices', className: 'bob', style: { top: 200, left: -44, width: 90 } },
  people: { icon: 'fruit', className: 'bob', style: { top: 200, left: -48, width: 92 } },
  diet: { icon: 'hummus', className: 'bob', style: { top: 200, left: -40, width: 92 } },
  details: { icon: 'tomatoes', className: 'bob', style: { top: 200, left: -40, width: 92 } },
  pay: { icon: 'tomatoes', className: 'bob', style: { top: 200, left: -40, width: 92 } },
}

export function Build(props: {
  shop: Shop
  draft: Draft
  setDraft: (d: Draft) => void
  stage: StageKey
  part: number
}) {
  const { shop, draft: d, setDraft } = props
  const wide = useWide()
  const recipient = draftRecipient(shop, d)
  const form = recipient ? RECIPIENT_FORM[recipient] : d.form
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [fieldErrors, setFieldErrors] = useState<ReturnType<typeof buyerErrors>>({})

  // A draft saved before recipients existed gets its recipient from its form.
  useEffect(() => {
    if (recipient && recipient !== d.recipient) setDraft(withRecipient(d, recipient))
  }, [recipient, d, setDraft])

  // The questions follow the occasion and who the game is for.
  const want = d.occasionKey && recipient ? `${d.occasionKey}|${recipient}` : ''
  const [loaded, setLoaded] = useState<{ key: string; questions: Question[] } | null>(null)
  const [loadError, setLoadError] = useState(false)
  useEffect(() => {
    if (!want) return
    let live = true
    const [occ, who] = want.split('|')
    getQuestions(occ, who).then(
      (questions) => live && setLoaded({ key: want, questions }),
      () => live && setLoadError(true),
    )
    return () => {
      live = false
    }
  }, [want])
  const questions = loaded?.key === want ? loaded.questions : null
  const asked = questions ? askedQuestions(questions, form) : null
  const parts = asked ? questionParts(asked, d.answersLater) : null

  const stages = buildStages(shop, d, parts)
  const index = findStage(stages, { key: props.stage, part: props.part })
  const cur = stages[index]
  const token = d.manageToken
  // Stages from the name on wait for the questions (unless the occasion is not picked yet: the
  // visitor is sent back to it).
  const ready = !needsQuestions(cur.key) || !want || !!questions

  // The photos taped on the map.
  useEffect(() => {
    if (!token) return setPhotos([])
    listPhotos(token).then(
      (r) => setPhotos(r.photos),
      () => {},
    )
  }, [token])

  // Land on a stage the draft may be on: an earlier one left undone, or the order not made yet.
  const target = ready ? gateStage(stages, index, d, shop, parts) : index
  const path = stagePath(stages[target], token)
  const here = location.pathname.replace(/\/+$/, '') || '/'
  useEffect(() => {
    if (ready && path !== here) navigate(path, { replace: true })
  }, [ready, path, here])

  // The direction of the move, for the transition; a new stage starts clean.
  const id = `${cur.key}-${cur.part}`
  const [view, setView] = useState({ id, index, dir: 'fwd' as 'fwd' | 'back' })
  if (view.id !== id) {
    setView({ id, index, dir: index >= view.index ? 'fwd' : 'back' })
    setError(null)
    setFieldErrors({})
  }
  // Keyboard and screen reader users start each new stage at its question.
  const first = useRef(true)
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the stage changes
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    document.getElementById(TITLE_ID)?.focus({ preventScroll: true })
  }, [id])

  if (loadError) return <Failed text={copy.loadFailed} />

  const set = (patch: Partial<Draft>) => {
    setError(null)
    setFieldErrors({})
    // A new occasion or recipient may not offer the chosen style: the first one offered instead.
    setDraft(withOfferedTheme(shop, { ...d, ...patch }))
  }

  /** Creates or updates the order on the server; returns its token. */
  const persist = async (draft: Draft): Promise<string> => {
    const qs = questions ?? []
    const e = step1Error(draft, shop) ?? step2Error(draft, qs, formChoice(shop, draft))
    if (e) throw new Incomplete(e)
    const payload = orderPayload(draft, qs)
    const key = payloadKey(payload)
    const action = saveAction(draft, key)
    let tok = draft.manageToken
    if (action === 'none' && tok) return tok
    if (action === 'update' && tok) {
      try {
        await updateOrder(tok, payload)
      } catch (err) {
        // Paid or gone: start a fresh order rather than editing it.
        if (!(err instanceof ApiError) || ![404, 409].includes(err.status)) throw err
        tok = null
      }
    }
    if (!tok || action === 'create') tok = (await createOrder(payload)).manageToken
    setDraft({ ...draft, manageToken: tok, savedKey: key })
    return tok
  }
  const failText = (err: unknown) =>
    err instanceof Incomplete ? err.message : errorText(err instanceof ApiError ? err.code : 'generic')

  const go = (s: Stage | undefined, tok: string | null) => s && navigate(stagePath(s, tok))
  const back = () => (index > 0 ? go(stages[index - 1], token) : navigate('/'))
  const next = async () => {
    if (busy) return
    if (cur.key === 'details') {
      const be = buyerErrors(d.buyer)
      setFieldErrors(be)
      if (Object.keys(be).length) return
    }
    const e = stageError(cur, d, shop, parts)
    if (e) return setError(e)
    let tok = token
    if (createsOrder(stages, index) || (SAVES_ORDER.includes(cur.key) && tok)) {
      setBusy(true)
      try {
        tok = await persist(d)
      } catch (err) {
        setError(failText(err))
        return
      } finally {
        setBusy(false)
      }
    }
    go(stages[index + 1], tok)
  }

  const decor = decorFor(shop, d.occasionKey)
  const margin = MARGIN[cur.key]
  const stageProps: StageProps = {
    shop,
    d,
    set,
    questions: questions ?? [],
    asked: cur.key === 'questions' ? (parts?.[cur.part - 1] ?? []) : [],
    part: cur.part,
    parts: parts?.length ?? 1,
    form,
    recipient,
    token,
    wide,
    onPhotos: setPhotos,
    buyerErrors: fieldErrors,
  }
  const map = (variant: 'strip' | 'side') => (
    <BuildMap shop={shop} draft={d} stages={stages} index={index} photos={photos} variant={variant} />
  )

  let body: ReactNode
  let nav: ReactNode = null
  if (!ready || target !== index) {
    body = (
      <div className="stage-wait" aria-busy="true">
        <Spinner />
      </div>
    )
  } else if (cur.key === 'pay') {
    body = <PayStage shop={shop} d={d} token={token} photos={photos.length} persist={persist} back={back} />
  } else {
    const Screen = SCREENS[cur.key]
    body = (
      <form
        className="stage-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          next()
        }}
      >
        <Screen {...stageProps} />
      </form>
    )
    nav = (
      <StageNav back={back} onNext={next} busy={busy} error={error}>
        {nextLabel(cur, stages, index, d, photos)}
      </StageNav>
    )
  }

  return (
    <main className="page build" data-decor={decor ?? undefined} data-stage={cur.key}>
      <Deco key={cur.key} icon={margin.icon} className={margin.className} style={margin.style} />
      {decor && (
        <Doodles
          key={decor}
          className="deco"
          decor={decor}
          spots={[
            { top: 260, left: 4, size: 46, rot: 10 },
            { top: 620, left: -6, size: 40, rot: -12 },
          ]}
        />
      )}
      {wide && map('side')}
      {index === 0 && <SiteNav current="order" />}
      {!wide && map('strip')}
      <section key={id} className="stage" data-dir={view.dir}>
        {body}
      </section>
      {nav}
    </main>
  )
}

/** A draft that cannot be saved yet; the message says what is missing. */
class Incomplete extends Error {}

/** The main button's words: where it leads, or that an optional stage can stay empty. */
function nextLabel(cur: Stage, stages: Stage[], index: number, d: Draft, photos: Photo[]) {
  if (createsOrder(stages, index)) return copy.build.toPhotos
  if (cur.key === 'photos' && !photos.length) return copy.build.skip
  if (cur.key === 'notes' && !cleanNotes(d.letterNotes).length) return copy.build.skip
  if (cur.key === 'hints' && !cleanHintQuestions(d.hintQuestions).length) return copy.build.skip
  if (cur.key === 'details') return copy.build.toSummary
  return copy.build.next
}

/** Back and next, together at the bottom (sticky on phones). */
function StageNav(props: {
  back: () => void
  onNext: () => void
  busy?: boolean
  error?: string | null
  children: ReactNode
}) {
  return (
    <div className="stage-nav">
      <button type="button" className="stage-back" onClick={props.back} aria-label={copy.build.backLabel}>
        <svg viewBox="0 0 40 24" aria-hidden="true">
          <path d="M4 12 C 14 10, 26 13, 36 11 M28 4 C 31 7, 34 9, 36 11 C 33 13, 31 16, 28 19" />
        </svg>
        <span>{copy.build.back}</span>
      </button>
      <Cta onClick={props.onNext} busy={props.busy} error={props.error}>
        {props.children}
      </Cta>
    </div>
  )
}

/** The last stage: the order as the server has it, and the payment. */
function PayStage(props: {
  shop: Shop
  d: Draft
  token: string | null
  photos: number
  persist: (d: Draft) => Promise<string>
  back: () => void
}) {
  const { shop, d } = props
  const token = props.token ?? ''
  const [order, setOrder] = useState<Manage | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: loads once per order
  useEffect(() => {
    let live = true
    // A change made by moving around (browser back and forward) is saved before the summary.
    props
      .persist(d)
      .then((tok) => getManage(tok))
      .then(
        (m) => {
          if (!live) return
          if (m.paid) navigate(`/m/${token}`, { replace: true })
          else setOrder(m)
        },
        (e) => live && setLoadError(errorText(e instanceof ApiError ? e.code : 'generic')),
      )
    return () => {
      live = false
    }
  }, [token])

  const pay = usePay(
    token,
    () => {
      clearDraft()
      navigate(`/m/${token}`)
    },
    async () => {
      await updateOrder(token, { buyer: d.buyer })
    },
  )

  if (loadError)
    return (
      <p className="error" role="alert">
        {loadError}
      </p>
    )
  if (!order)
    return (
      <div className="stage-wait" aria-busy="true">
        <Spinner />
      </div>
    )
  const amount = formatShekels(order.amountAgorot)
  return (
    <>
      <StageHead cheer={copy.build.cheer.pay} title={copy.build.title.pay} lead={copy.build.payLead} />
      <OrderSummary order={order} shop={shop} draft={d} photos={props.photos} />
      {pay.state.s === 'error' && (
        <p className="hint" style={{ marginTop: 16 }}>
          <Sketch href={`/m/${token}`} icon="ticket" small>
            {copy.pay.toManage}
          </Sketch>
        </p>
      )}
      <StageNav
        back={props.back}
        onNext={() => pay.start()}
        busy={pay.state.s === 'opening'}
        error={pay.state.s === 'error' ? pay.state.text : null}
      >
        {copy.checkout.pay(amount)}
      </StageNav>
      <PayLayer pay={pay} token={token} />
    </>
  )
}
