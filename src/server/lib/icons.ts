// The icon library on the server: checks keys against the manifest and resolves their URLs.
import { ICON_MANIFEST } from '../domain/icon-manifest.generated.ts'
import { iconUrl as urlOf } from '../domain/icons.ts'

const keys = new Set<string>(ICON_MANIFEST.map((e) => e.key))

/** True for a key in the manifest ("food/falafel-cone", or a classic like "falafel"). */
export const isIconKey = (v: unknown): v is string => typeof v === 'string' && keys.has(v)

/** Every icon key, sorted. */
export const iconNames = (): string[] => [...keys]

/** URL of a known icon, or null (unknown or empty). */
export const iconUrl = (name: string | null | undefined) => (isIconKey(name) ? urlOf(name) : null)
