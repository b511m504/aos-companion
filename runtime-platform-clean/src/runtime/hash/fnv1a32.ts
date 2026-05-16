/** Fast deterministic 32-bit FNV-1a → hex (used for state / queue fingerprints). */
export function fnv1a32Hex(input: string): string {
  let h = 2166136261 >>> 0
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, "0")
}
