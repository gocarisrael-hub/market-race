// Beside the riddle on wide screens (from 1024px): the market map and the route so far. Done
// stops name their stall and tasting, the current one is circled, the rest wait. Phones keep the
// trail of icons at the top and never render this.
import { Doodles } from '../../shared/decor.tsx'
import { riddleTitle, type T } from '../copy.ts'
import { HandCircle, Tick } from '../draw.tsx'
import { stopIcon } from '../logic.ts'
import { MapCrop } from './Reveal.tsx'
import type { ScreenProps } from './types.ts'

export function GameSide({ view, t }: { view: ScreenProps['view']; t: T }) {
  const cur = view.current!
  const done = new Map(view.completed.map((c) => [c.index, c]))
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
          icon={stopIcon(cur.index)}
          company={view.company}
          tint={view.theme?.palette.mapTint}
          t={t}
        />
      </div>
      <ol
        className="side-route"
        aria-label={t('riddle.stopOf', { n: cur.index + 1, total: view.totalStops })}
      >
        {Array.from({ length: view.totalStops }, (_, i) => {
          const c = done.get(i)
          const state = c ? 'done' : i === cur.index ? 'now' : 'later'
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: stops are positional
            <li key={i} className={state} aria-current={state === 'now' ? 'step' : undefined}>
              <span className="side-stop-icon">
                <img src={stopIcon(i)} alt="" />
                {c && <Tick />}
              </span>
              <span className="side-stop-text">
                <span className="side-stop-title">
                  {riddleTitle(t, i, i === view.totalStops - 1)}
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
