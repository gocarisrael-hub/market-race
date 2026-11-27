// Picks icons from the library: a search box (Hebrew label or English key), category tabs and a
// grid of lazy-loaded thumbnails. Single (a tasting's icon) or multiple (an occasion's icons).
import { useId, useMemo, useState } from 'react'
import { ICON_MANIFEST } from '../../server/domain/icon-manifest.generated.ts'
import { CLASSIC_LABEL, ICON_CATEGORIES, iconUrl } from '../../server/domain/icons.ts'

const byKey = new Map(ICON_MANIFEST.map((e) => [e.key as string, e]))
const CATS = [...ICON_CATEGORIES, { key: 'classic', label: CLASSIC_LABEL }] as const

/** Hebrew label of an icon key (the key itself when unknown). */
export const iconLabel = (key: string) => byKey.get(key)?.label ?? key

function norm(s: string) {
  return s.toLowerCase().replace(/[-_/]/g, ' ').trim()
}

export function IconPicker(props: {
  label: string
  /** Chosen keys, in order. */
  value: string[]
  onChange: (keys: string[]) => void
  multiple?: boolean
  max?: number
  /** Category the grid opens on when nothing is chosen. */
  initialCategory?: string
}) {
  const id = useId()
  const { value, multiple = false, max = 8 } = props
  const first = value[0] ? byKey.get(value[0])?.category : undefined
  const [cat, setCat] = useState<string>(first ?? props.initialCategory ?? 'food')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)

  const shown = useMemo(() => {
    const term = norm(q)
    if (!term) return ICON_MANIFEST.filter((e) => e.category === cat)
    return ICON_MANIFEST.filter((e) => e.label.includes(term) || norm(e.key).includes(term))
  }, [q, cat])

  const toggle = (key: string) => {
    if (!multiple) {
      props.onChange(value[0] === key ? [] : [key])
      setOpen(false)
      return
    }
    if (value.includes(key)) props.onChange(value.filter((k) => k !== key))
    else if (value.length < max) props.onChange([...value, key])
  }

  return (
    <fieldset className="icon-picker" data-testid="icon-picker">
      <legend>{props.label}</legend>
      <div className="icon-chosen">
        {value.length === 0 && <span className="muted">בלי איור</span>}
        {value.map((k) => (
          <span key={k} className="icon-chip">
            <img src={iconUrl(k)} alt="" width={40} height={40} />
            <span>{iconLabel(k)}</span>
            <button
              type="button"
              className="link"
              aria-label={`הסרת ${iconLabel(k)}`}
              onClick={() => toggle(k)}
            >
              ✕
            </button>
          </span>
        ))}
        <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
          {open ? 'סגירה' : value.length ? 'החלפה' : 'בחירת איור'}
        </button>
      </div>
      {multiple && (
        <p className="muted">
          עד {max} איורים. {value.length}/{max}
        </p>
      )}
      {open && (
        <div className="icon-browser" id={id}>
          <input
            type="search"
            placeholder="חיפוש: פלאפל, בירה, בלון…"
            aria-label="חיפוש איור"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {!q && (
            <div className="icon-cats" role="tablist" aria-label="קטגוריות">
              {CATS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  role="tab"
                  aria-selected={cat === c.key}
                  className={cat === c.key ? 'on' : ''}
                  onClick={() => setCat(c.key)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
          <div className="icon-grid" role="listbox" aria-multiselectable={multiple} aria-label={props.label}>
            {shown.map((e) => {
              const on = value.includes(e.key)
              return (
                <button
                  key={e.key}
                  type="button"
                  role="option"
                  aria-selected={on}
                  title={e.key}
                  className={on ? 'on' : ''}
                  onClick={() => toggle(e.key)}
                >
                  <img src={iconUrl(e.key)} alt="" loading="lazy" decoding="async" width={56} height={56} />
                  <span>{e.label}</span>
                </button>
              )
            })}
            {shown.length === 0 && <p className="muted">לא נמצא איור</p>}
          </div>
        </div>
      )}
    </fieldset>
  )
}
