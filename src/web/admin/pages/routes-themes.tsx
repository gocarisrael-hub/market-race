// Routes (ordered stops, the last one is the finale), themes (map, palette, stall pins) and the
// palettes buyers can play a map in.
import { useEffect, useState } from 'react'
import { CONTRAST_RULES, contrast, FONTS, paletteIssues, themeVars } from '../../../server/domain/look.ts'
import {
  type Palette,
  RECIPIENTS,
  type RouteStop,
  STYLE_COLORS,
  type StyleColor,
  THEME_FONTS,
  type ThemeStyle,
} from '../../../server/domain/types.ts'
import { api } from '../api.ts'
import {
  Check,
  CrudPage,
  type EditorProps,
  errorText,
  type Market,
  mapUrl,
  NumberInput,
  type Occasion,
  type PaletteRow,
  RECIPIENT_LABELS,
  type Riddle,
  type Route,
  Select,
  type Stall,
  type Tasting,
  Text,
  type Theme,
  useList,
} from '../ui.tsx'

function useMarkets() {
  const { items } = useList<Market>('/catalog/markets')
  const list = items ?? []
  return {
    items: list,
    options: list.map((m) => ({ value: m.id, label: m.name })),
    name: (id: number) => list.find((m) => m.id === id)?.name ?? `#${id}`,
  }
}

// ---------- Routes ----------

function StopEditor({
  stop,
  index,
  last,
  stalls,
  tastings,
  riddles,
  issues,
  onChange,
  onMove,
  onRemove,
}: {
  stop: RouteStop
  index: number
  last: boolean
  stalls: Stall[]
  tastings: Tasting[]
  riddles: Riddle[]
  issues: string[]
  onChange: (s: RouteStop) => void
  onMove: (by: number) => void
  onRemove: () => void
}) {
  const stallOpts = stalls.map((s) => ({ value: s.id, label: s.name }))
  const tOpts = (stallId: number | null | undefined) =>
    tastings.filter((t) => t.stallId === stallId).map((t) => ({ value: t.id, label: t.name }))
  const rOpts = (stallId: number | null | undefined) =>
    riddles.filter((r) => r.stallId === stallId).map((r) => ({ value: r.id, label: r.title || r.answer }))
  const first = (opts: { value: number }[]) => opts[0]?.value ?? 0
  return (
    <fieldset className="stop" data-testid={`stop-${index}`}>
      <legend>
        תחנה {index + 1}
        {last && <strong className="finale"> (גמר)</strong>}
      </legend>
      <div className="row">
        <Select
          label="דוכן"
          value={stop.stallId || null}
          options={stallOpts}
          onChange={(stallId) =>
            onChange({
              ...stop,
              stallId,
              tastingId: first(tOpts(stallId)),
              riddleId: first(rOpts(stallId)),
            })
          }
        />
        <Select
          label="טעימה"
          value={stop.tastingId || null}
          options={tOpts(stop.stallId)}
          onChange={(tastingId) => onChange({ ...stop, tastingId })}
        />
        <Select
          label="חידה"
          value={stop.riddleId || null}
          options={rOpts(stop.stallId)}
          onChange={(riddleId) => onChange({ ...stop, riddleId })}
        />
      </div>
      <div className="row">
        <Select
          label="דוכן גיבוי"
          value={stop.backupStallId}
          placeholder="ללא גיבוי"
          options={stallOpts.filter((o) => o.value !== stop.stallId)}
          onChange={(v) =>
            onChange({ ...stop, backupStallId: v || null, backupTastingId: null, backupRiddleId: null })
          }
        />
        {stop.backupStallId != null && (
          <>
            <Select
              label="טעימת גיבוי"
              value={stop.backupTastingId}
              placeholder="לפי בטיחות (אוטומטי)"
              options={tOpts(stop.backupStallId)}
              onChange={(v) => onChange({ ...stop, backupTastingId: v || null })}
            />
            <Select
              label="חידת גיבוי"
              value={stop.backupRiddleId}
              placeholder="אותה חידה"
              options={rOpts(stop.backupStallId)}
              onChange={(v) => onChange({ ...stop, backupRiddleId: v || null })}
            />
          </>
        )}
      </div>
      {issues.length > 0 && <p className="error">{issues.join(', ')}</p>}
      <div className="actions">
        <button type="button" onClick={() => onMove(-1)}>
          למעלה
        </button>
        <button type="button" onClick={() => onMove(1)}>
          למטה
        </button>
        <button type="button" className="danger" onClick={onRemove}>
          הסרת תחנה
        </button>
      </div>
    </fieldset>
  )
}

function RouteEditor({ value, set, issues }: EditorProps<Route>) {
  const mk = useMarkets()
  const stalls = (useList<Stall>('/catalog/stalls').items ?? []).filter((s) => s.marketId === value.marketId)
  const tastings = useList<Tasting>('/catalog/tastings').items ?? []
  const riddles = useList<Riddle>('/catalog/riddles').items ?? []
  const stops = value.stops ?? []
  const move = (i: number, by: number) => {
    const j = i + by
    if (j < 0 || j >= stops.length) return
    const next = [...stops]
    ;[next[i], next[j]] = [next[j], next[i]]
    set({ stops: next })
  }
  return (
    <>
      <Select
        label="שוק"
        value={value.marketId}
        options={mk.options}
        onChange={(marketId) => set({ marketId })}
      />
      <Text label="שם" value={value.name} onChange={(name) => set({ name })} required />
      <Check label="פעיל" checked={value.active} onChange={(active) => set({ active })} />
      {stops.map((s, i) => (
        <StopEditor
          // biome-ignore lint/suspicious/noArrayIndexKey: stops are positional
          key={i}
          stop={s}
          index={i}
          last={i === stops.length - 1}
          stalls={stalls}
          tastings={tastings}
          riddles={riddles}
          issues={issues.filter((x) => x.path.startsWith(`stops.${i}.`)).map((x) => x.message)}
          onChange={(ns) => set({ stops: stops.map((x, j) => (j === i ? ns : x)) })}
          onMove={(by) => move(i, by)}
          onRemove={() => set({ stops: stops.filter((_, j) => j !== i) })}
        />
      ))}
      <button
        type="button"
        onClick={() =>
          set({ stops: [...stops, { stallId: 0, tastingId: 0, riddleId: 0, backupStallId: null }] })
        }
      >
        הוספת תחנה
      </button>
    </>
  )
}

export function RoutesPage() {
  const mk = useMarkets()
  return (
    <CrudPage<Route>
      section="routes"
      title="מסלולים"
      path="/catalog/routes"
      newLabel="מסלול חדש"
      blank={() => ({ marketId: mk.items[0]?.id, name: '', stops: [], active: true })}
      columns={[
        { label: 'שם', render: (r) => r.name },
        { label: 'שוק', render: (r) => mk.name(r.marketId) },
        { label: 'תחנות', render: (r) => r.stops.length },
        { label: 'מצב', render: (r) => (r.active ? 'פעיל' : 'לא פעיל') },
      ]}
      Editor={RouteEditor}
    />
  )
}

// ---------- Themes ----------

const COLORS: { key: keyof Palette; label: string }[] = [
  { key: 'background', label: 'רקע' },
  { key: 'accent', label: 'צבע הדגשה' },
  { key: 'ink', label: 'דיו (טקסט)' },
  { key: 'paper', label: 'נייר' },
]

function MapPins({
  mapFile,
  pins,
  stalls,
  onChange,
}: {
  mapFile: string
  pins: Theme['pins']
  stalls: Stall[]
  onChange: (pins: Theme['pins']) => void
}) {
  const [stallId, setStallId] = useState<number | null>(null)
  const name = (id: string) => stalls.find((s) => String(s.id) === id)?.name ?? `#${id}`
  return (
    <fieldset>
      <legend>נעצים על המפה</legend>
      <Select
        label="דוכן למיקום (בחרו ואז לחצו על המפה)"
        value={stallId}
        options={stalls.map((s) => ({ value: s.id, label: `${s.name}${pins[s.id] ? ' (ממוקם)' : ''}` }))}
        onChange={(v) => setStallId(v || null)}
      />
      <div
        className="map"
        onClick={(e) => {
          if (!stallId) return
          const r = e.currentTarget.getBoundingClientRect()
          const round = (n: number) => Math.round(Math.min(100, Math.max(0, n)) * 10) / 10
          onChange({
            ...pins,
            [stallId]: {
              x: round(((e.clientX - r.left) / r.width) * 100),
              y: round(((e.clientY - r.top) / r.height) * 100),
            },
          })
        }}
      >
        <img src={mapUrl(mapFile)} alt="מפה" />
        {Object.entries(pins).map(([id, p]) => (
          <span key={id} className="pin" style={{ left: `${p.x}%`, top: `${p.y}%` }} title={name(id)}>
            {name(id)}
          </span>
        ))}
      </div>
      <ul>
        {Object.entries(pins).map(([id, p]) => (
          <li key={id}>
            {name(id)}: {p.x}%, {p.y}%{' '}
            <button
              type="button"
              onClick={() => onChange(Object.fromEntries(Object.entries(pins).filter(([k]) => k !== id)))}
            >
              הסרה
            </button>
          </li>
        ))}
      </ul>
    </fieldset>
  )
}

function ThemeEditor({ value, set }: EditorProps<Theme>) {
  const mk = useMarkets()
  const stalls = (useList<Stall>('/catalog/stalls').items ?? []).filter((s) => s.marketId === value.marketId)
  const [builtin, setBuiltin] = useState<string[]>([])
  const [uploadError, setUploadError] = useState('')
  useEffect(() => {
    api<{ builtin: string[] }>('/catalog/maps').then((r) => setBuiltin(r.builtin))
  }, [])
  const palette = value.palette ?? {
    background: '#ffffff',
    accent: '#000000',
    ink: '#000000',
    paper: '#ffffff',
  }
  const setPalette = (p: Partial<Palette>) => set({ palette: { ...palette, ...p } })
  const mapOptions = [
    ...builtin,
    ...(value.mapFile && !builtin.includes(value.mapFile) ? [value.mapFile] : []),
  ]

  return (
    <>
      <Text label="שם" value={value.name} onChange={(name) => set({ name })} required />
      <Select
        label="שוק"
        value={value.marketId}
        options={mk.options}
        onChange={(marketId) => set({ marketId })}
      />
      <NumberInput label="סדר" value={value.sort} onChange={(sort) => set({ sort })} />
      <Check label="פעיל" checked={value.active} onChange={(active) => set({ active })} />
      <fieldset>
        <legend>צבעים</legend>
        <div className="row">
          {COLORS.map((c) => (
            <label key={c.key}>
              {c.label}
              <input
                type="color"
                value={String(palette[c.key] ?? '#000000')}
                onChange={(e) => setPalette({ [c.key]: e.target.value })}
              />
            </label>
          ))}
          <Check
            label="צבע הדגשה נוסף"
            checked={!!palette.accent2}
            onChange={(on) => setPalette({ accent2: on ? palette.accent : undefined })}
          />
          {palette.accent2 && (
            <label>
              הדגשה נוספת
              <input
                type="color"
                value={palette.accent2}
                onChange={(e) => setPalette({ accent2: e.target.value })}
              />
            </label>
          )}
          <Check
            label="ערכה כהה"
            checked={palette.dark}
            onChange={(dark) => setPalette({ dark: dark || undefined })}
          />
        </div>
      </fieldset>
      <fieldset>
        <legend>מפה</legend>
        <Select
          label="קובץ מפה"
          value={value.mapFile}
          options={mapOptions.map((m) => ({ value: m, label: m.replace(/^builtin:/, 'מובנית: ') }))}
          onChange={(mapFile) => set({ mapFile })}
        />
        <label>
          העלאת מפה (jpg, png, webp)
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              setUploadError('')
              const fd = new FormData()
              fd.append('file', file)
              try {
                const r = await api<{ mapFile: string }>('/catalog/maps', { method: 'POST', body: fd })
                set({ mapFile: r.mapFile })
              } catch (err) {
                setUploadError(errorText(err))
              }
            }}
          />
        </label>
        {uploadError && <p className="error">{uploadError}</p>}
      </fieldset>
      <StyleFields value={value} set={set} />
      {value.mapFile && (
        <MapPins
          mapFile={value.mapFile}
          pins={value.pins ?? {}}
          stalls={stalls}
          onChange={(pins) => set({ pins })}
        />
      )}
    </>
  )
}

const STYLE_COLOR_LABELS: Record<StyleColor, string> = {
  onBg: 'טקסט על הרקע',
  ribbon: 'סרט',
  ribbonTail: 'זנבות הסרט',
  ribbonLine: 'קו הסרט',
  onRibbon: 'טקסט על הסרט',
  button: 'כפתור',
  onButton: 'טקסט על הכפתור',
  buttonLine: 'קו הכפתור',
  paperLine: 'קו הפתקים',
  sheetLine: 'קו הדף בפתיחה',
  kicker: 'כותרת החידה',
  slot: 'טקסט אישי',
  hint: 'רמז',
  label: 'תוויות',
  mark: 'סימונים (עיגול, חץ)',
  brand: 'רקע שם המותג',
  onBrand: 'שם המותג',
}

/** The style: fonts, treatment, illustrations, fixed colors, and who it is offered to. */
function StyleFields({ value, set }: Pick<EditorProps<Theme>, 'value' | 'set'>) {
  const occasions = useList<Occasion>('/catalog/occasions').items ?? []
  const style = value.style ?? {}
  const setStyle = (p: Partial<ThemeStyle>) => set({ style: { ...style, ...p } })
  const colors = style.colors ?? {}
  const setColor = (k: StyleColor, c: string | undefined) => {
    const next = { ...colors }
    if (c) next[k] = c
    else delete next[k]
    setStyle({ colors: next })
  }
  const palette = value.palette ?? BLANK_PALETTE
  const v = themeVars(palette, style)
  const occ = value.occasionKeys ?? []
  const rec = value.recipients ?? []
  return (
    <>
      <fieldset>
        <legend>סגנון</legend>
        <div className="row">
          <Select
            label="גופן תצוגה"
            value={style.font ?? 'amatic'}
            options={THEME_FONTS.map((f) => ({ value: f, label: FONTS[f].label }))}
            onChange={(font) => setStyle({ font })}
          />
          <Select
            label="ציור הכפתור והסרט"
            value={style.treatment ?? 'brush'}
            options={[
              { value: 'brush', label: 'מכחול ודיו' },
              { value: 'neon', label: 'ניאון זוהר' },
              { value: 'foil', label: 'הטבעת זהב' },
            ]}
            onChange={(treatment) => setStyle({ treatment })}
          />
          <Select
            label="מצב"
            value={style.mode ?? 'light'}
            options={[
              { value: 'light', label: 'בהיר' },
              { value: 'dark', label: 'כהה (גם הפתקים)' },
            ]}
            onChange={(mode) => setStyle({ mode })}
          />
          <Select
            label="ראש מסך החידה"
            value={style.riddleTop ?? 'trail'}
            options={[
              { value: 'trail', label: 'שביל איורים' },
              { value: 'banner', label: 'רצועת מפה ושביל' },
            ]}
            onChange={(riddleTop) => setStyle({ riddleTop })}
          />
          <Text
            label="סט איורים (תיקייה ב-assets/icons, ריק: המקור)"
            value={style.icons ?? ''}
            onChange={(icons) => setStyle({ icons: icons.trim() || undefined })}
          />
          <Check
            label="קו על קצה הדף בפתיחה"
            checked={style.sheetLine !== false}
            onChange={(on) => setStyle({ sheetLine: on ? undefined : false })}
          />
          <Check
            label="טקסט החידה בגופן התצוגה"
            checked={!!style.serifBody}
            onChange={(on) => setStyle({ serifBody: on || undefined })}
          />
        </div>
      </fieldset>
      <fieldset>
        <legend>צבעים קבועים (כשמשחקים בצבעי העיצוב עצמו; ריק: נגזר מהצבעים)</legend>
        <div className="row">
          {STYLE_COLORS.map((k) => (
            <label key={k}>
              <Check
                label={STYLE_COLOR_LABELS[k]}
                checked={!!colors[k]}
                onChange={(on) => setColor(k, on ? '#000000' : undefined)}
              />
              {colors[k] && (
                <input type="color" value={colors[k]} onChange={(e) => setColor(k, e.target.value)} />
              )}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>בדיקת קריאוּת</legend>
        <ul className="contrast">
          {CONTRAST_RULES.map((r) => {
            const ratio = contrast(r.fg(palette, v), r.bg(palette, v))
            return (
              <li key={r.check} className={ratio >= r.min ? 'ok' : 'bad'}>
                <span className="swatches">
                  <i style={{ background: r.bg(palette, v) }} />
                  <i style={{ background: r.fg(palette, v) }} />
                </span>{' '}
                {r.check}: {ratio.toFixed(2)}:1 (צריך {r.min}:1)
              </li>
            )
          })}
        </ul>
        {paletteIssues(palette, style).length > 0 && (
          <p className="error">הצבעים לא קריאים מספיק ולא יישמרו. כהו או בהירו אותם.</p>
        )}
      </fieldset>
      <fieldset>
        <legend>מוצע לאירועים (בלי סימון: לכולם)</legend>
        {occasions.map((o) => (
          <Check
            key={o.key}
            label={o.label}
            checked={occ.includes(o.key)}
            onChange={(on) =>
              set({ occasionKeys: on ? [...new Set([...occ, o.key])] : occ.filter((x) => x !== o.key) })
            }
          />
        ))}
      </fieldset>
      <fieldset>
        <legend>למי (בלי סימון: לכולם)</legend>
        {RECIPIENTS.map((r) => (
          <Check
            key={r}
            label={RECIPIENT_LABELS[r]}
            checked={rec.includes(r)}
            onChange={(on) =>
              set({ recipients: on ? [...new Set([...rec, r])] : rec.filter((x) => x !== r) })
            }
          />
        ))}
      </fieldset>
    </>
  )
}

export function ThemesPage() {
  const mk = useMarkets()
  return (
    <CrudPage<Theme>
      section="themes"
      title="עיצובים"
      path="/catalog/themes"
      newLabel="עיצוב חדש"
      blank={() => ({
        name: '',
        marketId: mk.items[0]?.id,
        mapFile: '',
        palette: { background: '#ffffff', accent: '#000000', ink: '#000000', paper: '#ffffff' },
        pins: {},
        style: {},
        occasionKeys: [],
        recipients: [],
        sort: 0,
        active: true,
      })}
      columns={[
        { label: 'שם', render: (t) => t.name },
        { label: 'שוק', render: (t) => mk.name(t.marketId) },
        {
          label: 'מוצע ל',
          render: (t) => (t.occasionKeys?.length ? t.occasionKeys.join(', ') : 'כל האירועים'),
        },
        {
          label: 'צבעים',
          render: (t) => (
            <span className="swatches">
              {[t.palette.background, t.palette.accent, t.palette.ink, t.palette.paper].map((c, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed order
                <i key={i} style={{ background: c }} />
              ))}
            </span>
          ),
        },
        { label: 'מצב', render: (t) => (t.active ? 'פעיל' : 'לא פעיל') },
      ]}
      Editor={ThemeEditor}
    />
  )
}

// ---------- Palettes ----------

function PaletteEditor({ value, set }: EditorProps<PaletteRow>) {
  const themes = useList<Theme>('/catalog/themes').items ?? []
  const palette = value.palette ?? BLANK_PALETTE
  const setPalette = (p: Partial<Palette>) => set({ palette: { ...palette, ...p } })
  const ids = value.themeIds ?? []
  const v = themeVars(palette)
  const issues = paletteIssues(palette)
  return (
    <>
      <Text
        label="שם (כפי שהקונים רואים אותו)"
        value={value.name}
        onChange={(name) => set({ name })}
        required
      />
      <NumberInput
        label="סדר (הראשון הוא ברירת המחדל)"
        value={value.sort}
        onChange={(sort) => set({ sort })}
      />
      <Check label="פעיל" checked={value.active} onChange={(active) => set({ active })} />
      <fieldset>
        <legend>צבעים</legend>
        <div className="row">
          {COLORS.map((c) => (
            <label key={c.key}>
              {c.label}
              <input
                type="color"
                value={String(palette[c.key] ?? '#000000')}
                onChange={(e) => setPalette({ [c.key]: e.target.value })}
              />
            </label>
          ))}
          <Check
            label="צבע הדגשה נוסף"
            checked={!!palette.accent2}
            onChange={(on) => setPalette({ accent2: on ? palette.accent : undefined })}
          />
          {palette.accent2 && (
            <label>
              הדגשה נוספת
              <input
                type="color"
                value={palette.accent2}
                onChange={(e) => setPalette({ accent2: e.target.value })}
              />
            </label>
          )}
          <Check
            label="צביעת המפה"
            checked={!!palette.mapTint}
            onChange={(on) => setPalette({ mapTint: on ? palette.accent : undefined })}
          />
          {palette.mapTint && (
            <label>
              גוון המפה
              <input
                type="color"
                value={palette.mapTint}
                onChange={(e) => setPalette({ mapTint: e.target.value })}
              />
            </label>
          )}
          <Check
            label="ערכה כהה"
            checked={palette.dark}
            onChange={(dark) => setPalette({ dark: dark || undefined })}
          />
        </div>
      </fieldset>
      <fieldset>
        <legend>בדיקת קריאוּת</legend>
        <ul className="contrast">
          {CONTRAST_RULES.map((r) => {
            const ratio = contrast(r.fg(palette, v), r.bg(palette, v))
            return (
              <li key={r.check} className={ratio >= r.min ? 'ok' : 'bad'}>
                <span className="swatches">
                  <i style={{ background: r.bg(palette, v) }} />
                  <i style={{ background: r.fg(palette, v) }} />
                </span>{' '}
                {r.check}: {ratio.toFixed(2)}:1 (צריך {r.min}:1)
              </li>
            )
          })}
        </ul>
        {issues.length > 0 && <p className="error">הצבעים לא קריאים מספיק ולא יישמרו. כהו או בהירו אותם.</p>}
      </fieldset>
      <fieldset>
        <legend>על אילו מפות</legend>
        {themes.map((t) => (
          <Check
            key={t.id}
            label={t.name}
            checked={ids.includes(t.id)}
            onChange={(on) =>
              set({ themeIds: on ? [...new Set([...ids, t.id])] : ids.filter((x) => x !== t.id) })
            }
          />
        ))}
      </fieldset>
    </>
  )
}

const BLANK_PALETTE: Palette = { background: '#EADBC8', accent: '#B4161B', ink: '#2B2420', paper: '#FFFBF4' }

export function PalettesPage() {
  const themes = useList<Theme>('/catalog/themes').items ?? []
  const themeName = (id: number) => themes.find((t) => t.id === id)?.name ?? `#${id}`
  return (
    <CrudPage<PaletteRow>
      section="palettes"
      title="צבעים"
      path="/catalog/palettes"
      newLabel="צבע חדש"
      blank={() => ({ name: '', palette: { ...BLANK_PALETTE }, themeIds: [], sort: 0, active: true })}
      columns={[
        { label: 'שם', render: (p) => p.name },
        {
          label: 'צבעים',
          render: (p) => (
            <span className="swatches">
              {[p.palette.background, p.palette.accent, p.palette.ink, p.palette.paper].map((c, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed order
                <i key={i} style={{ background: c }} />
              ))}
            </span>
          ),
        },
        { label: 'מפות', render: (p) => p.themeIds.map(themeName).join(', ') },
        { label: 'מצב', render: (p) => (p.active ? 'פעיל' : 'לא פעיל') },
      ]}
      Editor={PaletteEditor}
    />
  )
}
