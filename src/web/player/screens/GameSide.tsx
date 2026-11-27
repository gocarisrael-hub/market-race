// Beside the riddle or mini-game on wide screens (from 1024px): the market map and the route so
// far, stops and mini-games. Done stops name their stall and tasting, the current stage is circled. Phones keep the
// trail of icons at the top and never render this.
import { Doodles } from '../../shared/decor.tsx'
import { stageTitle, type T } from '../copy.ts'
import { HandCircle, Tick } from '../draw.tsx'
import { stopIconKey } from '../logic.ts'
import { MapCrop } from './Reveal.tsx'
import { StageIcon } from './Stages.tsx'
import type { ScreenProps } from './types.ts'

export function GameSide({ view, t }: { view: ScreenProps['view']; t: T }) {
  const done = new Map(view.completed.map((c) => [c.index, c]))
  // The map shows the stop being played, or (on a mini-game) the next one.
  const at = view.current?.index ?? view.stopIndex
  return (
    <aside className="game-side">
      <div className="side-map">
        <Doodles
          decor={view.decor}
          spots={[
            { top: -14, left: '6%', size: 44, rot: -12 },
            { bottom: 8, right: '2%', size: 40, rot: 10 },
          ]}
        />
        <MapCrop
          map={view.theme?.map ?? null}
          pin={null}
          icon={stopIconKey(at)}
          company={view.company}
          tint={view.theme?.palette.mapTint}
          t={t}
        />
      </div>
      <ol
        className="side-route"
        aria-label={t('riddle.stopOf', { n: view.stage, total: view.stages.length })}
      >
        {view.stages.map((s) => {
          const c = s.kind === 'stop' ? done.get(s.index) : undefined
          const state = s.state === 'now' ? 'now' : s.state === 'later' ? 'later' : 'done'
          return (
            <li
              key={`${s.kind}${s.index}`}
              className={`${state} ${s.kind}`}
              aria-current={state === 'now' ? 'step' : undefined}
            >
              <span className="side-stop-icon">
                <StageIcon stage={s} size={40} />
                {s.state === 'done' && <Tick />}
              </span>
              <span className="side-stop-text">
                <span className="side-stop-title">
                  {stageTitle(t, s, view.totalStops)}
                  {state === 'now' && <HandCircle />}
                </span>
                {c && (
                  <span className="side-stop-where">
                    {c.stall} · {c.tasting}
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ol>
    </aside>
  )
}
