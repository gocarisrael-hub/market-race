// The captain's part of the manage page. The buyer starts the game at the market (choosing how
// many players arrived, after a clear confirm), then shares the players' link on WhatsApp and
// goes straight into the game. Nobody else can start it: the game link only shows a waiting screen.
import { useState } from 'react'
import { ApiError, type Manage as M, startGame } from '../api.ts'
import { copy } from '../copy.ts'
import { clampPlayers, errorText, whatsappShare } from '../logic.ts'
import { BrushAnchor, Cta, QNote, Ring, TornPaper } from '../ui.tsx'

export function StartGame(props: { token: string; m: M; onStarted: () => void }) {
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
      <h2 className="sub" id="start-title">
        {c.title}
      </h2>
      <p className="hint">{c.intro}</p>
      {!confirming ? (
        <>
          <QNote id="l-players" tilt={-1.2}>
            {c.players}
          </QNote>
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
          <p className="hint">{c.playersHint}</p>
          <Cta onClick={() => setConfirming(true)}>{c.button}</Cta>
        </>
      ) : (
        <TornPaper tilt="r">
          <div role="alertdialog" aria-labelledby="confirm-title" aria-describedby="confirm-body">
            <h2 className="sub" id="confirm-title">
              {c.confirmTitle}
            </h2>
            <p id="confirm-body">{c.confirmBody(players)}</p>
            <p>
              <button type="button" className="link-btn" disabled={busy} onClick={() => setConfirming(false)}>
                {c.back}
              </button>
            </p>
          </div>
          <Cta onClick={start} busy={busy} error={error}>
            {c.confirm}
          </Cta>
        </TornPaper>
      )}
    </section>
  )
}

/** After the start: the players' link on WhatsApp (the owner's text), then into the game. */
export function ShareGame({ m }: { m: M }) {
  const c = copy.manage.share
  if (!m.gameLink) return null
  return (
    <section className="section share-game" aria-labelledby="share-title">
      <h2 className="sub share-title rise" id="share-title">
        {c.title}
      </h2>
      {m.players != null && <p className="lead">{c.players(m.players)}</p>}
      <p className="hint">{c.intro}</p>
      {m.invite && (
        <div className="share-brush">
          <BrushAnchor href={whatsappShare(m.invite.text)}>{c.button}</BrushAnchor>
        </div>
      )}
      <p className="share-continue">
        <a className="big-link link-btn edit-btn" href={m.gameLink}>
          {c.continue}
          <Ring />
        </a>
      </p>
      {m.qr && (
        <div className="game-link">
          <p className="hint">{c.qr}</p>
          <img className="qr" src={m.qr} alt={copy.manage.qrAlt} />
        </div>
      )}
    </section>
  )
}
