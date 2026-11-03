const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [['second', 60], ['minute', 60], ['hour', 24], ['day', 7], ['week', 4.35], ['month', 12], ['year', Infinity]]

/** "5 minutes ago", "yesterday"… for a time in ms since the epoch. */
export function timeAgo(at: number, now = Date.now()): string {
  let value = (at - now) / 1000
  for (const [unit, size] of STEPS) {
    if (Math.abs(value) < size) return unit === 'second' ? 'just now' : RELATIVE.format(Math.round(value), unit)
    value /= size
  }
  return ''
}
