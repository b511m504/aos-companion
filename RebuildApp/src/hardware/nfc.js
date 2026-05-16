/**
 * NFC hardware boundary (architecture-learning phase).
 * Roster viewer and selection screens stay unaware of this module.
 * Real Capacitor NFC plugin calls would live here later; UI screens call these
 * helpers instead of importing plugins directly.
 */

/**
 * Deterministic stub sequence: alternates two fixed ids so you can
 * (a) assign two different tags in one session, and
 * (b) re-read the same id after two clicks to test idempotent / duplicate rules.
 * Real hardware will return stable unique tag UIDs instead.
 */
let stubAlternate = false

/**
 * Placeholder for future tag read. Today: resolves with a fake payload for wiring tests.
 * @returns {Promise<{ id: string }>}
 */
export const ENABLE_DEV_FIXTURES = false

export async function readTagStub() {
  if (!ENABLE_DEV_FIXTURES) {
    throw new Error('DEV_FIXTURES_DISABLED')
  }
  stubAlternate = !stubAlternate
  const id = stubAlternate ? 'stub-tag-A' : 'stub-tag-B'
  console.log('[hardware/nfc] readTagStub (no native plugin yet)', id)
  return Promise.resolve({ id })
}
