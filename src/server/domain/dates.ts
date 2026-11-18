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
