export function formatTimelineClock(wallMs: number): string {
  const d = new Date(wallMs)
  const pad = (n: number) => String(n).padStart(2, "0")
  const ms = String(d.getMilliseconds()).padStart(3, "0")
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms}`
}
