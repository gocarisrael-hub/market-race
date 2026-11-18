// Illustrations shipped in assets/icons, served at /static/icons/<name>.png.
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const dir = fileURLToPath(new URL('../../../assets/icons', import.meta.url))
let cached: string[] | null = null

/** Icon names (file names without extension) that have a .png. */
export function iconNames(): string[] {
  cached ??= readdirSync(dir)
    .filter((f) => f.endsWith('.png'))
    .map((f) => f.slice(0, -4))
    .sort()
  return cached
}

export const iconUrl = (name: string | null | undefined) =>
  name && iconNames().includes(name) ? `/static/icons/${name}.png` : null
