// The route as stages, on the trail across the top (phones and desktop) and in the side list
// (desktop): stops show their food icon, mini-games their doodle. Progress counts both.

import type { DoodleName } from '../../shared/decor.tsx'
import { Icon } from '../../shared/decor.tsx'
import type { T } from '../copy.ts'
import { Tick, Trail } from '../draw.tsx'
import { stopIcon } from '../logic.ts'
import type { ScreenProps } from './types.ts'

export const GAME_ICONS: Record<string, DoodleName> = {
  who_said: 'chat',
  true_false: 'check',
  photo: 'camera',
  cipher: 'key',
}

type Stage = ScreenProps['view']['stages'][number]

/** A stage's picture: the stop's food icon, or the mini-game's doodle. */
export function StageIcon({
  stage,
  size,
  className = '',
}: {
  stage: Stage
  size: number
  className?: string
}) {
  if (stage.kind === 'game')
    return (
      <span className={`stage-game ${className}`} style={{ width: size, height: size }}>
        <Icon name={GAME_ICONS[stage.type ?? ''] ?? 'question'} size={size} tilt={-6} />
      </span>
    )
  return <img className={className} src={stopIcon(stage.index)} alt="" />
}

export function StageTrail({ view, t }: { view: ScreenProps['view']; t: T }) {
  const label = t('riddle.stopOf', { n: view.stage, total: view.stages.length })
  return (
    <header className="trail">
      <Trail />
      <ol className={`trail-stops ${view.stages.length > 5 ? 'many' : ''}`} aria-label={label}>
        {view.stages.map((s) => {
          const now = s.state === 'now'
          return (
            <li
              key={`${s.kind}${s.index}`}
              className={`${now ? 'now' : s.state === 'later' ? 'later' : 'done'} ${s.kind}`}
              aria-current={now ? 'step' : undefined}
            >
              <StageIcon stage={s} size={now ? 56 : 34} className={now ? 'bob' : ''} />
              {s.state === 'done' && <Tick />}
            </li>
          )
        })}
      </ol>
      <div className="trail-label">{label}</div>
    </header>
  )
}
