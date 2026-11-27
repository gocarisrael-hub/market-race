// Which library icon goes where in the order build: each stage's, each recipient's, each occasion's
// and, where it is obvious, each question's. Illustration, not data (the occasion's own icons are
// the admin's).
import { decorIcons, type IconKey } from '../../../server/domain/icons.ts'
import type { Occasion } from '../api.ts'
import type { StageKey } from '../stages.ts'

/** Each stage's icon: on the progress map where the build stands, and by the stage's title. */
export const STAGE_ICONS: Partial<Record<StageKey, IconKey>> = {
  occasion: 'game/gift',
  for: 'game/heart',
  name: 'game/pencil',
  questions: 'game/question-bubble',
  photos: 'game/camera',
  notes: 'game/sealed-envelope',
  hints: 'game/key',
  people: 'reactions/high-five',
  diet: 'game/fork-knife',
  details: 'game/ticket',
  pay: 'game/finish-flag',
}

/** An occasion's own first icon, else its doodle set's. */
export const occasionIcon = (o: Pick<Occasion, 'decor' | 'icons'>): string => decorIcons(o.decor, o.icons)[0]

const RECIPIENT_ICONS: Record<string, IconKey> = {
  she: 'animals/butterfly',
  he: 'animals/hedgehog',
  couple: 'game/heart',
  group: 'reactions/high-five',
  family: 'animals/turtle',
}
// A kid's birthday: animals and toys.
const KIDS_RECIPIENT_ICONS: Record<string, IconKey> = {
  she: 'animals/ladybug',
  he: 'animals/turtle',
  couple: 'game/heart',
  group: 'fun/soccer-ball',
  family: 'animals/hedgehog',
}

export function recipientIcon(recipient: string, decor?: string | null): IconKey | null {
  return (decor === 'kids' ? KIDS_RECIPIENT_ICONS : RECIPIENT_ICONS)[recipient] ?? null
}

// Keywords in a question's slot, first match wins. Only the obvious ones: no icon beats a wrong one.
const QUESTION_ICONS: [RegExp, IconKey][] = [
  [/photo/, 'game/camera'],
  [/song|music/, 'ui/music-notes'],
  [/food|kitchen|hungry|dish|eat/, 'game/fork-knife'],
  [/place|where|city|trip/, 'game/map-pin'],
  [/love|heart/, 'game/heart'],
  [/dream|wish/, 'nature/moon'],
  [/catchphrase|saying|word|said/, 'game/speech-bubble'],
  [/game|play|hobby/, 'game/dice'],
  [/friend/, 'reactions/high-five'],
  [/laugh/, 'reactions/face-laughing'],
  [/late|time|years/, 'game/alarm-clock'],
  [/phone/, 'ui/smartphone'],
  [/moment|memory|legend|tradition/, 'game/star'],
  [/project|work|offsite/, 'game/rocket'],
]

/** A question's icon by its slot, or null when nothing obvious fits. */
export function questionIcon(slot: string): IconKey | null {
  return QUESTION_ICONS.find(([re]) => re.test(slot))?.[1] ?? null
}
