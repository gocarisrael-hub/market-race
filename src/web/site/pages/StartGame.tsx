// The captain's part of the manage page. The buyer starts the game at the market (choosing how
// many players arrived, after a clear confirm), then shares the players' link on WhatsApp and
// goes straight into the game. Nobody else can start it: the game link only shows a waiting screen.
// The captain can pause the game from their own phone in the game; it resumes here (ResumeGame).
import { useState } from 'react'
import { Doodles, Icon, SketchShape } from '../../shared/decor.tsx'
import { ApiError, type Manage as M, resumeGame, startGame } from '../api.ts'
import { copy } from '../copy.ts'
import { clampPlayers, errorText, whatsappShare } from '../logic.ts'
import { Brush, Cta, QNote, SectionHead, Sketch, TornPaper } from '../ui.tsx'

export function StartGame(props: { token: string; m: M; decor?: string | null; onStarted: () => void }) {
  const max = props.m.start.maxPlayers
  const [players, setPlayers] = useState(max)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const c = copy.manage.start

  const start = async () => {
    setBusy(true)
    setError(null)
    try {
      await startGame(props.token, players)
      props.onStarted()
    } catch (e) {
      setError(errorText(e instanceof ApiError ? e.code : 'generic'))
      setBusy(false)
    }
  }
  const step = (n: number) => {
    setError(null)
    setPlayers(clampPlayers(n, max))
  }

  return (
    <section className="section start-game" aria-labelledby="start-title">
      <TornPaper tilt="r">
        <Doodles
          decor={props.decor}
          className="deco start-doodles"
          spots={[
            { top: -18, left: 6, size: 40, rot: -10 },
            { bottom: 14, left: 2, size: 32, rot: 12 },
          ]}
        />
        <SectionHead icon="flagStart" id="start-title">
          {c.title}
        </SectionHead>
        <p className="hint">{c.intro}</p>
        {!confirming ? (
          <>
            <div className="players-head">
              <Icon name="people" size={44} tilt={-6} />
              <QNote id="l-players" tilt={-1.2}>
                {c.players}
              </QNote>
            </div>
            <div className="stepper">
              <button
                type="button"
                aria-label={c.less}
                disabled={players <= 1}
                onClick={() => step(players - 1)}
              >
                −
              </button>
              <output className="n" aria-live="polite" aria-labelledby="l-players" data-testid="players">
                {players}
              </output>
              <button
                type="button"
                aria-label={c.more}
                disabled={players >= max}
                onClick={() => step(players + 1)}
              >
                +
              </button>
              <span className="unit">{c.playersUnit(players, max)}</span>
            </div>
            <p className="hint players-hint">
              <Icon name="plate" size={26} />
              <span>{c.playersHint}</span>
            </p>
            <div className="m-action">
              <Brush icon="flagStart" onClick={() => setConfirming(true)}>
                {c.button}
              </Brush>
            </div>
          </>
        ) : (
          <div
            className="start-confirm rise"
            role="alertdialog"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-body"
          >
            <h3 className="confirm-title" id="confirm-title">
              <Icon name="alert" size={38} tilt={-8} />
              <span>{c.confirmTitle}</span>
            </h3>
            <p id="confirm-body">{c.confirmBody(players)}</p>
            <Cta onClick={start} busy={busy} error={error}>
              {c.confirm}
            </Cta>
            <div className="confirm-back">
              <Sketch small icon="clock" disabled={busy} onClick={() => setConfirming(false)}>
                {c.back}
              </Sketch>
            </div>
          </div>
        )}
      </TornPaper>
    </section>
  )
}

/** After the start: the players' link on WhatsApp (the owner's text), then into the game. */
export function ShareGame({ m, decor }: { m: M; decor?: string | null }) {
  const c = copy.manage.share
  if (!m.gameLink) return null
  return (
    <section className="section share-game" aria-labelledby="share-title">
      <TornPaper tilt="l">
        <Doodles
          decor={decor}
          className="deco share-doodles"
          spots={[
            { top: -14, left: 10, size: 36, rot: -12 },
            { bottom: 18, left: 6, size: 32, rot: 10 },
          ]}
        />
        <SectionHead icon="flagStart" id="share-title">
          {c.title}
        </SectionHead>
        {m.players != null && (
          <p className="share-players">
            <Icon name="people" size={34} tilt={6} />
            <span>{c.players(m.players)}</span>
          </p>
        )}
        <p className="hint">{c.intro}</p>
        {m.invite && (
          <div className="m-action share-brush">
            <Brush href={whatsappShare(m.invite.text)} external icon="chat">
              {c.button}
            </Brush>
          </div>
        )}
        {/* The captain's own phone goes on into the game, in this tab (another bundle), carrying
            the captain token that lets this phone pause the game. */}
        <div className="share-continue">
          <a className="sketch" href={m.captainLink ?? m.gameLink}>
            <SketchShape />
            <Icon name="map" />
            <span>{c.continue}</span>
          </a>
        </div>
        {m.qr && (
          <div className="share-qr">
            <p className="hint">{c.qr}</p>
            <span className="taped-qr">
              <span className="washi washi-a" aria-hidden="true" />
              <span className="washi washi-b" aria-hidden="true" />
              <img className="qr" src={m.qr} alt={copy.manage.qrAlt} />
            </span>
          </div>
        )}
      </TornPaper>
    </section>
  )
}

/**
 * Paused by the captain ("עוצרים להיום" in the game): where they stopped, and a brush-stroke
 * "ממשיכים" that resumes the game for everyone at the same stop and takes this phone back in.
 */
export function ResumeGame(props: { token: string; m: M; decor?: string | null; onResumed: () => void }) {
  const { m } = props
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const c = copy.manage.paused
  if (!m.paused) return null

  const resume = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await resumeGame(props.token)
      window.location.assign(r.captainLink)
    } catch (e) {
      setError(errorText(e instanceof ApiError ? e.code : 'generic'))
      setBusy(false)
      props.onResumed()
    }
  }

  return (
    <section className="section resume-game" aria-labelledby="resume-title">
      <TornPaper tilt="r">
        <Doodles
          decor={props.decor}
          className="deco share-doodles"
          spots={[
            { top: -16, left: 8, size: 38, rot: -10 },
            { bottom: 16, left: 4, size: 30, rot: 12 },
          ]}
        />
        <SectionHead icon="clock" id="resume-title">
          {c.title}
        </SectionHead>
        <p className="resume-where" data-testid="paused-where">
          <Icon name="pin" size={34} tilt={-6} />
          <span>{c.where(m.paused.stop, m.paused.total)}</span>
        </p>
        {m.players != null && (
          <p className="share-players">
            <Icon name="people" size={34} tilt={6} />
            <span>{c.players(m.players)}</span>
          </p>
        )}
        {m.resume.can ? (
          <>
            <p className="hint">{c.intro}</p>
            <Cta onClick={resume} busy={busy} error={error}>
              {c.button}
            </Cta>
          </>
        ) : (
          <p className="status">{m.resume.reason === 'expired' ? c.expired : error}</p>
        )}
      </TornPaper>
    </section>
  )
}
