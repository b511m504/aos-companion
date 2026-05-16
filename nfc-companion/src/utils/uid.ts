/**
 * Normalize NFC UIDs for stable equality (hex, uppercase, colon-separated bytes).
 */
export function normalizeUid(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ""

  const noSpaces = trimmed.replace(/\s+/g, "")

  if (noSpaces.includes(":")) {
    return noSpaces
      .split(":")
      .map((p) => p.padStart(2, "0").toUpperCase())
      .join(":")
  }

  const hex = noSpaces.replace(/[^0-9a-fA-F]/g, "")
  if (!hex) return ""

  const pairs: string[] = []
  for (let i = 0; i < hex.length; i += 2) {
    const pair = hex.slice(i, i + 2)
    if (pair.length === 1) pairs.push(`0${pair}`.toUpperCase())
    else pairs.push(pair.toUpperCase())
  }
  return pairs.join(":")
}

export function isValidUid(uid: string): boolean {
  return /^[0-9A-F]{2}(?::[0-9A-F]{2})+$/.test(uid)
}

/** Short display for tables (last three bytes); full value in `title` where needed. */
export function shortTagLabel(uid: string): string {
  const n = uid.trim()
  if (!n) return "—"
  const parts = n.split(":").filter(Boolean)
  if (parts.length >= 3) return `···${parts.slice(-3).join(":")}`
  return n.length > 14 ? `···${n.slice(-10)}` : n
}

/** Deterministic-looking random UID for dev / stress (7 bytes, colon-separated). */
export function generateRandomNormalizedUid(): string {
  const bytes = new Uint8Array(7)
  crypto.getRandomValues(bytes)
  const parts: string[] = []
  for (let i = 0; i < bytes.length; i++) {
    parts.push(bytes[i]!.toString(16).toUpperCase().padStart(2, "0"))
  }
  return parts.join(":")
}
