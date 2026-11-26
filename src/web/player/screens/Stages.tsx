// The route as stages, on the trail across the top (phones and desktop) and in the side list
// (desktop): stops show their food icon, mini-games their doodle. Progress counts both.

import type { IconKey } from '../../../server/domain/icons.ts'
import { LibIcon } from '../../shared/icon.tsx'
import type { T } from '../copy.ts'
import { Tick, Trail } from '../draw.tsx'
import { stopIconKey } from '../logic.ts'
import type { ScreenProps } from './types.ts'

/** Each mini-game's icon, from the library's game set. */
export const GAME_ICONS: Record<string, IconKey> = {
  who_said: 'game/speech-bubble',
  true_false: 'game/magnifier',
  photo: 'game/camera',
  cipher: 'game/padlock',
}

type Stage = ScreenProps['view']['stages'][number]

/** A stage's picture: the stop's food icon (its tasting's once solved), or the mini-game's icon. */
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
        <LibIcon icon={GAME_ICONS[stage.type ?? ''] ?? 'game/question-bubble'} size={size} tilt={-6} eager />
      </span>
    )
  return (
    <LibIcon
      className={`stage-stop ${className}`}
      icon={stopIconKey(stage.index, stage.icon)}
      size={size}
      eager
      style={{ width: undefined, height: undefined }}
    />
  )
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
