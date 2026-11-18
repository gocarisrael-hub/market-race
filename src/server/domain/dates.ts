// The market day is in Israel time.
export const TZ = 'Asia/Jerusalem'

/** YYYY-MM-DD of `at` in Israel. */
export function israelDate(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
}

export function addYears(date: string, years: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y + years, m - 1, d))
  // 29 Feb + 1y -> 28 Feb
  if (t.getUTCMonth() !== m - 1) t.setUTCDate(0)
  return t.toISOString().slice(0, 10)
}

/** Milliseconds Israel wall-clock time is ahead of UTC at `at`. */
function israelOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return wall - Math.floor(at.getTime() / 1000) * 1000
}

/** The UTC instant of 00:00 Israel time on the given calendar day. */
export function israelMidnight(year: number, month: number, day: number): Date {
  const wall = Date.UTC(year, month - 1, day)
  let t = wall - israelOffsetMs(new Date(wall))
  t = wall - israelOffsetMs(new Date(t))
  return new Date(t)
}

/** [from, to) of a calendar month ("YYYY-MM") in Israel time. */
export function israelMonthRange(month: string): { from: Date; to: Date } {
  const m = /^(\d{4})-(\d{2})$/.exec(month)
  const y = Number(m?.[1])
  const mo = Number(m?.[2])
  if (!m || mo < 1 || mo > 12) throw new Error(`bad month: ${month}`)
  return {
    from: israelMidnight(y, mo, 1),
    to: mo === 12 ? israelMidnight(y + 1, 1, 1) : israelMidnight(y, mo + 1, 1),
  }
}

/** "YYYY-MM" of `at` in Israel. */
export function israelMonth(at: Date = new Date()): string {
  return israelDate(at).slice(0, 7)
}
