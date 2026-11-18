import type { Loaded, PlayAction, PlayerView } from '../api.ts'
import type { T } from '../copy.ts'

export interface ScreenProps {
  view: PlayerView
  t: T
  act: (a: PlayAction) => Promise<Loaded>
}
