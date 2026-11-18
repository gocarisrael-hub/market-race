// Routes (ordered stops, the last one is the finale) and themes (map, palette, stall pins).
import { useEffect, useState } from 'react'
import type { Palette, RouteStop } from '../../../server/domain/types.ts'
import { api } from '../api.ts'
import {
  Check,
  CrudPage,
  type EditorProps,
  errorText,
  type Market,
  mapUrl,
  NumberInput,
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
        sort: 0,
        active: true,
      })}
      columns={[
        { label: 'שם', render: (t) => t.name },
        { label: 'שוק', render: (t) => mk.name(t.marketId) },
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
