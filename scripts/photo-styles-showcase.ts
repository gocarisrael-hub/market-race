// Renders every prototype photo style (src/server/photos/styles.ts) on sample photos into one
// self-contained HTML page (JPEG data URIs), for the owner to choose from. The first section is
// the live look (src/server/photos/doodle-frame.ts), with a few seeds of one photo for variety.
// usage: node scripts/photo-styles-showcase.ts <samples-dir> <out.html> name[:label] ...
// Each sample is <name>.jpg plus, for the cutout versions, <name>-cut.png (the browser cutout).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { doodleFrameCutout, doodleFramePhoto } from '../src/server/photos/doodle-frame.ts'
import { illustrate, illustrateCutout } from '../src/server/photos/illustrate.ts'
import { PHOTO_STYLES, type StyleMode } from '../src/server/photos/styles.ts'

const [dir, out, ...specs] = process.argv.slice(2)
if (!dir || !out || !specs.length)
  throw new Error('usage: photo-styles-showcase.ts <dir> <out.html> name[:label]...')
const WIDTH = 440
const icons = ['falafel', 'coffee', 'flowers', 'hummus'].map((n) => readFileSync(`assets/icons/${n}.png`))

const samples = specs.map((s) => {
  const [name, label] = s.split(':')
  const cut = path.join(dir, `${name}-cut.png`)
  return {
    name,
    label: label ?? name,
    photo: readFileSync(path.join(dir, `${name}.jpg`)),
    cutout: existsSync(cut) ? readFileSync(cut) : null,
  }
})

const uri = async (jpg: Buffer) =>
  `data:image/jpeg;base64,${(await sharp(jpg).resize(WIDTH).jpeg({ quality: 70, mozjpeg: true }).toBuffer()).toString('base64')}`
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

const modeName: Record<StyleMode, string> = { bg: 'עם רקע', cut: 'בלי רקע' }
const sections: string[] = []

// The live look: style 14 reworked, the photo kept as it is. Each photo its own seed (its id).
{
  const figs: string[] = []
  const look = { decor: 'birthday', height: 900 }
  for (const [k, s] of samples.entries()) {
    const seed = 101 + k
    figs.push(fig(await uri(await doodleFramePhoto(s.photo, { ...look, seed })), `${s.label}, עם רקע`))
    if (s.cutout)
      figs.push(fig(await uri(await doodleFrameCutout(s.cutout, { ...look, seed })), `${s.label}, בלי רקע`))
  }
  const first = samples[0]
  for (const seed of [7, 23, 58])
    figs.push(
      fig(
        await uri(await doodleFramePhoto(first.photo, { ...look, seed })),
        `${first.label}, עם רקע, שרבוטים אחרים (${seed})`,
      ),
    )
  if (first.cutout)
    for (const seed of [7, 23, 58])
      figs.push(
        fig(
          await uri(await doodleFrameCutout(first.cutout, { ...look, seed })),
          `${first.label}, בלי רקע, שרבוטים אחרים (${seed})`,
        ),
      )
  sections.push(
    section(
      '14 החדש',
      'מסגרת שרבוטים, התמונה נשארת',
      'התמונה עצמה נשארת חדה וכמו במקור, רק בגוון חם של נייר. העיגול והשרבוטים מסביב, בצבעי המשחק ומהסט של האירוע, ולכל תמונה בחירה אחרת. שום שרבוט לא נוגע בפנים. בשורה האחרונה: אותה תמונה עם שרבוטים אחרים.',
      figs,
    ),
  )
}

// Reference: the photo itself and today's converter.
{
  const figs: string[] = []
  for (const s of samples) {
    figs.push(fig(await uri(await sharp(s.photo).jpeg().toBuffer()), `${s.label}: המקור`))
    figs.push(fig(await uri(await illustrate(s.photo, { maxSize: 600 })), `${s.label}: היום, עם רקע`))
    if (s.cutout)
      figs.push(
        fig(await uri(await illustrateCutout(s.cutout, { maxSize: 600 })), `${s.label}: היום, בלי רקע`),
      )
  }
  sections.push(section('0', 'המצב היום', 'התמונות המקוריות והציור שעולה היום לאתר, להשוואה.', figs))
}

for (const st of PHOTO_STYLES) {
  const figs: string[] = []
  for (const s of samples)
    for (const m of st.modes) {
      if (m === 'cut' && !s.cutout) continue
      const t0 = Date.now()
      const jpg = await st.render(s, m, { width: WIDTH * 1.5, icons, seed: 7 })
      console.log(`${st.no} ${st.id} ${s.name} ${m} ${Date.now() - t0}ms`)
      figs.push(fig(await uri(jpg), `${s.label}, ${modeName[m]}`))
    }
  sections.push(section(String(st.no), st.name, st.line, figs))
}

function fig(src: string, caption: string) {
  return `<figure><img src="${src}" alt="${esc(caption)}" loading="lazy"><figcaption>${esc(caption)}</figcaption></figure>`
}
function section(no: string, name: string, line: string, figs: string[]) {
  return `<section id="s${no.replace(/\s.*/, 'n')}"><header><span class="no">${no}</span><div><h2>${esc(name)}</h2><p>${esc(line)}</p></div></header><div class="grid">${figs.join('')}</div></section>`
}

const html = `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>סגנונות תמונה</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Amatic+SC:wght@700&family=Heebo:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--bg:#F6EBDA;--paper:#FFFBF4;--ink:#2B2420;--muted:#6E625A;--accent:#B4161B}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#F6EBDA;--paper:#FFFBF4;--ink:#2B2420;--muted:#6E625A;--accent:#B4161B}}
:root[data-theme="dark"]{--bg:#F6EBDA;--paper:#FFFBF4;--ink:#2B2420;--muted:#6E625A;--accent:#B4161B}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:Heebo,system-ui,sans-serif;line-height:1.5}
main{max-width:1180px;margin:0 auto;padding:28px 16px 80px}
h1{font-family:'Amatic SC',cursive;font-size:64px;line-height:1;margin:0 0 6px;color:var(--accent)}
.intro{max-width:720px;color:var(--muted);margin:0 0 10px}
nav{display:flex;flex-wrap:wrap;gap:4px 16px;margin:14px 0 30px;font-family:'Amatic SC',cursive;font-size:26px}
nav a{color:var(--ink);text-decoration:none}
nav a:hover{color:var(--accent)}
section{margin:46px 0}
header{display:flex;gap:16px;align-items:flex-start;margin-bottom:14px}
.no{font-family:'Amatic SC',cursive;font-size:56px;line-height:.9;color:var(--accent);min-width:48px;text-align:center}
h2{font-family:'Amatic SC',cursive;font-size:42px;line-height:1;margin:0}
header p{margin:4px 0 0;color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:22px}
figure{margin:0}
figure img{display:block;width:100%;height:auto;aspect-ratio:4/5;object-fit:cover;background:var(--paper)}
figure:nth-child(odd) img{transform:rotate(-1deg)}
figure:nth-child(even) img{transform:rotate(1deg)}
figcaption{font-size:14px;color:var(--muted);margin-top:8px}
@media (max-width:520px){h1{font-size:48px}.grid{grid-template-columns:1fr 1fr;gap:14px}}
</style></head><body><main>
<h1>סגנונות תמונה לבחירה</h1>
<p class="intro">למעלה: 14 החדש, המראה שעולה עכשיו למשחק. מתחתיו, כל הסגנונות שהוצגו קודם, על אותן תמונות, עם רקע ובלי רקע (הדמות גזורה בדפדפן, כמו בדוגרי).</p>
<nav><a href="#s14n">14 החדש</a>${['0. היום', ...PHOTO_STYLES.map((s) => `${s.no}. ${s.name}`)].map((t, i) => `<a href="#s${i}">${esc(t)}</a>`).join('')}</nav>
${sections.join('\n')}
</main></body></html>`
writeFileSync(out, html)
console.log(`${out}: ${(html.length / 1024 / 1024).toFixed(2)}MB`)
