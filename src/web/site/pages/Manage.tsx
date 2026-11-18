// /m/:token: the buyer's manage page. Status, the game link and QR, progress, and the edit mode
// (name, answers, letter notes, photos) until the game starts.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, getManage, type Manage as M } from '../api.ts'
import { copy } from '../copy.ts'
import { errorText, whatsappShare } from '../logic.ts'
import { Deco, Failed, Link, Loading, Ring } from '../ui.tsx'
import { ManageEdit } from './ManageEdit.tsx'

const ACTIVE_POLL_MS = 15_000
const PAID_POLL_MS = 4000

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
    return <Failed text={loadError === copy.errors.not_found ? copy.manage.notFound : loadError} />
  if (!m) return <Loading />

  const [t1, t2] = copy.manage.title(m.honoree)
  const payHref = m.kind === 'company' ? `/pay/${token}` : `/order/${token}/pay`
  // Paid with "answer later" and nothing sent yet: the form is open, worded as first answers.
  const first = m.needsAnswers && m.status !== 'review'
  const showForm = m.editable && !!m.questions && (editing || first)
  const canPay = !m.paid && (m.status === 'pending_payment' || m.status === 'quoted') && m.amountAgorot > 0

  return (
    <main className="page">
      <Deco
        icon="gate"
        className="bob"
        style={{ top: 10, left: -30, width: 130, ['--r' as string]: '-6deg' }}
      />
      <div style={{ marginTop: 70, marginLeft: 80 }}>
        <div className="eyebrow">{copy.manage.orderNo(m.orderNo)}</div>
        <h1 className="title rise">
          {t1}
          <br />
          {t2}
        </h1>
      </div>

      <p className="status" data-testid="status">
        {waitingPay ? copy.manage.checking : (copy.manage.status[m.status] ?? '')}
      </p>
      {canPay && !waitingPay && (
        <p>
          <Link href={payHref} className="big-link">
            {copy.manage.payNow}
          </Link>
        </p>
      )}

      {m.progress && (m.status === 'active' || m.status === 'done') && m.progress.total > 0 && (
        <p className="hint">
          {copy.manage.progress(Math.min(m.progress.stopIndex + 1, m.progress.total), m.progress.total)}
          {' · '}
          {copy.manage.redeemed(m.progress.redeemed)}
        </p>
      )}

      {m.gameLink && (
        <section className="section">
          <h2 className="sub">{copy.manage.gameTitle}</h2>
          <div className="game-link">
            {m.qr && <img className="qr" src={m.qr} alt={copy.manage.qrAlt} />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <a className="big-link" href={m.gameLink}>
                {copy.manage.openGame}
              </a>
              <a href={whatsappShare(copy.manage.shareText(m.gameLink))} target="_blank" rel="noopener">
                {copy.manage.share}
              </a>
            </div>
          </div>
          <ol className="howto">
            {copy.manage.howTo.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ol>
          {m.validUntil && (
            <p className="hint">
              {copy.manage.validUntil(
                new Date(m.validUntil).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }),
              )}
            </p>
          )}
        </section>
      )}

      {submitted && !editing && (
        <p className="status" role="status">
          {submitted === 'first' ? copy.manage.submitted : copy.manage.saved}
        </p>
      )}
      {showForm ? (
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
      ) : (
        m.editable && (
          <section className="section">
            <button
              type="button"
              className="big-link link-btn edit-btn"
              onClick={() => {
                setSubmitted(null)
                setEditing(true)
              }}
            >
              {copy.manage.edit}
              <Ring />
            </button>
            <p className="hint">{copy.manage.editHint}</p>
          </section>
        )
      )}
      {!showForm && m.photos?.editable && (
        <section className="section">
          <h2 className="sub">{copy.manage.photosTitle}</h2>
          <p>
            <Link href={`/order/${token}/photos`}>{copy.manage.photosLink(m.photos.count)}</Link>
          </p>
          <p className="hint">{copy.manage.photosHint}</p>
        </section>
      )}
    </main>
  )
}
