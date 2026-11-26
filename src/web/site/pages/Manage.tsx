// /m/:token: the buyer's manage page. Status, progress, the edit mode (name, answers, letter
// notes, hint questions, photos) until the game starts, and the captain's start: the buyer starts
// the game at the market, then shares the players' link and goes into the game. Drawn as a page of
// a market notebook: torn-paper sections with drawn headers, the occasion's doodles in the margins.
import { useCallback, useEffect, useRef, useState } from 'react'
import { type DoodleName, Doodles, Icon } from '../../shared/decor.tsx'
import { Desk } from '../../shared/desk.tsx'
import { ApiError, getManage, type Manage as M } from '../api.ts'
import { copy } from '../copy.ts'
import { errorText } from '../logic.ts'
import { PhotoDrop } from '../photo-background.tsx'
import { Brush, Deco, Failed, Loading, SectionHead, TornPaper } from '../ui.tsx'
import { ManageEdit } from './ManageEdit.tsx'
import { ResumeGame, ShareGame, StartGame } from './StartGame.tsx'

const ACTIVE_POLL_MS = 15_000
const PAID_POLL_MS = 4000

// The drawn icon beside each status line.
const STATUS_ICON: Record<string, DoodleName> = {
  quoted: 'clock',
  pending_payment: 'clock',
  awaiting_answers: 'pencil',
  review: 'magnifier',
  ready: 'check',
  active: 'flagStart',
  done: 'trophy',
  expired: 'hourglass',
  cancelled: 'alert',
}
const HOWTO_ICONS: DoodleName[] = ['pin', 'flagStart', 'chat', 'basket']

// Doodles down both margins of the page; each takes the next doodle of the occasion's set.
const MARGIN_SPOTS = [
  { top: 18, right: 6, size: 36, rot: 10 },
  { top: 190, left: 4, size: 30, rot: -12 },
  { top: 420, right: -4, size: 28, rot: 14 },
  { top: 640, left: -6, size: 32, rot: -8 },
  { top: 880, right: -2, size: 26, rot: 6 },
  { top: 1100, left: -4, size: 30, rot: 12 },
  { top: 1340, right: -6, size: 28, rot: -10 },
  { top: 1600, left: -2, size: 26, rot: 8 },
  { top: 1860, right: -4, size: 30, rot: -14 },
  { top: 2120, left: -6, size: 28, rot: 10 },
]

export function Manage({ token, search }: { token: string; search: string }) {
  const [m, setM] = useState<M | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<'first' | 'edit' | null>(null)
  const [editing, setEditing] = useState(false)
  const checking = new URLSearchParams(search).get('paid') === '1'
  const started = useRef(Date.now())

  const loaded = useRef(false)
  const load = useCallback(
    () =>
      getManage(token).then(
        (x) => {
          loaded.current = true
          setM(x)
        },
        (e) => {
          // Only the first load reports errors; a failed refresh keeps what is shown.
          if (!loaded.current) setLoadError(errorText(e instanceof ApiError ? e.code : 'generic'))
        },
      ),
    [token],
  )
  useEffect(() => {
    load()
  }, [load])

  // Keep it fresh while something is about to change: payment settling, or a game being played.
  const waitingPay = !!m && !m.paid && checking && Date.now() - started.current < 120_000
  const live = !!m && (m.status === 'active' || m.status === 'review' || waitingPay)
  useEffect(() => {
    if (!live) return
    const id = window.setInterval(load, waitingPay ? PAID_POLL_MS : ACTIVE_POLL_MS)
    return () => window.clearInterval(id)
  }, [live, waitingPay, load])

  // The emails link to #answers (first answers) and to the page itself (edits).
  const hasManage = !!m
  useEffect(() => {
    if (!hasManage || location.hash !== '#answers') return
    setEditing(true)
    window.setTimeout(() => document.getElementById('answers')?.scrollIntoView(), 0)
  }, [hasManage])

  if (loadError)
    return (
      <>
        <Desk />
        <Failed text={loadError === copy.errors.not_found ? copy.manage.notFound : loadError} />
      </>
    )
  if (!m)
    return (
      <>
        <Desk />
        <Loading />
      </>
    )

  const [t1, t2] = copy.manage.title(m.honoree)
  const payHref = m.kind === 'company' ? `/pay/${token}` : `/order/${token}/pay`
  // Paid with "answer later" and nothing sent yet: the form is open, worded as first answers.
  const first = m.needsAnswers && m.status !== 'review'
  const showForm = m.editable && !!m.questions && (editing || first)
  const canPay = !m.paid && (m.status === 'pending_payment' || m.status === 'quoted') && m.amountAgorot > 0
  const decor = m.decor ?? 'generic'

  return (
    <>
      <Desk map={m.look?.map} decor={decor} />
      <main className="page manage" data-decor={decor}>
        <Doodles className="deco margin-doodles" decor={decor} spots={MARGIN_SPOTS} />
        <Deco
          icon="gate"
          className="bob"
          style={{ top: 10, left: -30, width: 130, ['--r' as string]: '-6deg' }}
        />
        <header className="m-head">
          <div className="eyebrow order-tag">
            <Icon name="ticket" size={26} tilt={-10} />
            {copy.manage.orderNo(m.orderNo)}
          </div>
          <h1 className="title rise">
            {t1}
            <br />
            {t2}
          </h1>
        </header>

        <div className="m-status">
          <Icon
            name={m.paused ? 'clock' : (STATUS_ICON[waitingPay ? 'pending_payment' : m.status] ?? 'star')}
            size={40}
            tilt={-6}
          />
          <p className="status" data-testid="status">
            {waitingPay
              ? copy.manage.checking
              : m.paused
                ? copy.manage.paused.status
                : (copy.manage.status[m.status] ?? '')}
          </p>
        </div>
        {canPay && !waitingPay && (
          <div className="m-action">
            <Brush href={payHref}>{copy.manage.payNow}</Brush>
          </div>
        )}

        {!m.paused &&
          m.progress &&
          (m.status === 'active' || m.status === 'done') &&
          m.progress.total > 0 && (
            <p className="hint m-progress">
              <Icon name="basket" size={28} />
              <span>
                {copy.manage.progress(Math.min(m.progress.stopIndex + 1, m.progress.total), m.progress.total)}
                {' · '}
                {copy.manage.redeemed(m.progress.redeemed)}
              </span>
            </p>
          )}

        {/* Wide screens: a notebook spread. The game and its sharing on one page, the edits on the
            other; phones read the two pages one after the other, as before. */}
        <div className="m-spread">
          <div className="m-page m-page-play">
            {/* Started: share the players' link, then into the game (the captain's own phone). */}
            {m.started && m.status === 'active' && !m.paused && <ShareGame m={m} decor={decor} />}
            {/* Paused by the captain in the game: resume here, at the same stop. */}
            {m.paused && <ResumeGame token={token} m={m} decor={decor} onResumed={load} />}
            {m.gameLink && m.status === 'done' && (
              <div className="m-action">
                <Brush href={m.gameLink} external small icon="trophy">
                  {copy.manage.openGame}
                </Brush>
              </div>
            )}

            {/* Before the start: how it works (no game link to pass around yet), then the start itself. */}
            {m.gameLink && !m.started && m.status === 'ready' && (
              <TornPaper tilt="l">
                <SectionHead icon="map">{copy.manage.gameTitle}</SectionHead>
                <h3 className="howto-title">{copy.manage.howToTitle}</h3>
                <ol className="howto drawn">
                  {copy.manage.howTo.map((l, i) => (
                    <li key={l}>
                      <Icon name={HOWTO_ICONS[i % HOWTO_ICONS.length]} size={34} tilt={i % 2 ? 6 : -6} />
                      <span>{l}</span>
                    </li>
                  ))}
                </ol>
                {m.validUntil && (
                  <p className="hint valid-until">
                    <Icon name="hourglass" size={24} />
                    {copy.manage.validUntil(
                      new Date(m.validUntil).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }),
                    )}
                  </p>
                )}
              </TornPaper>
            )}

            {m.status === 'ready' && !m.started && !showForm && m.start.can && (
              <StartGame token={token} m={m} decor={decor} onStarted={load} />
            )}
            {m.status === 'ready' && m.start.reason === 'expired' && (
              <div className="m-status">
                <Icon name="hourglass" size={40} tilt={-6} />
                <p className="status">{copy.manage.start.expired}</p>
              </div>
            )}
          </div>
          <div className="m-page m-page-edit">
            {submitted && !editing && (
              <p className="status saved-note" role="status">
                <Icon name="check" size={32} />
                {submitted === 'first' ? copy.manage.submitted : copy.manage.saved}
              </p>
            )}
            {!showForm && m.editable && (
              <section className="section m-edit-entry">
                <Icon name="pencil" size={54} tilt={-10} className="entry-icon" />
                <div>
                  <p className="entry-ask">{copy.manage.editIntro}</p>
                  <Brush
                    small
                    icon="pencil"
                    onClick={() => {
                      setSubmitted(null)
                      setEditing(true)
                    }}
                  >
                    {copy.manage.edit}
                  </Brush>
                  <p className="hint">{copy.manage.editHint}</p>
                </div>
              </section>
            )}
            {!showForm && m.photos?.editable && (
              <section className="section">
                <SectionHead icon="frame" tilt={6}>
                  {copy.manage.photosTitle}
                </SectionHead>
                <PhotoDrop token={token} count={m.photos.count} />
                <p className="hint">{copy.manage.photosHint}</p>
              </section>
            )}
          </div>
        </div>
        {showForm && (
          <ManageEdit
            token={token}
            m={m}
            first={first}
            onCancel={first ? undefined : () => setEditing(false)}
            onDone={() => {
              setSubmitted(first ? 'first' : 'edit')
              setEditing(false)
              load()
            }}
          />
        )}
        <Deco
          icon="spices"
          className="bob foot-deco"
          style={{ bottom: 6, left: -18, width: 86, ['--r' as string]: '10deg' }}
        />
      </main>
    </>
  )
}
