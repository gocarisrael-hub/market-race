// Company logos: read the dominant colors with sharp (downscaled), then pick the palette.
import sharp from 'sharp'
import { companyPalette, dominantColors, type Swatch } from '../domain/palette.ts'
import type { Palette } from '../domain/types.ts'

export async function logoSwatches(file: string | Buffer): Promise<Swatch[]> {
  const { data } = await sharp(file)
    .resize(64, 64, { fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return dominantColors(new Uint8Array(data.buffer, data.byteOffset, data.length), 5)
}

export async function paletteFromLogo(file: string | Buffer, theme: Palette) {
  const swatches = await logoSwatches(file)
  return { swatches, palette: companyPalette(swatches, theme) }
}
