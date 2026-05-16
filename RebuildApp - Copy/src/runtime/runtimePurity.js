import { stableStringify } from './runtimeStateHash.js'

function isDevLike() {
  try {
    return typeof globalThis !== 'undefined' && globalThis.__SPEARHEAD_NFC_VERBOSE_DIAG__ === true
  } catch {
    return false
  }
}

function deepClone(v) {
  return JSON.parse(JSON.stringify(v))
}

export function runRuntimePurityChecks(domain, transitionFn, prevState, action, result) {
  if (!isDevLike()) return
  const src = String(transitionFn || '')
  if (src.includes('Date.now(') || src.includes('Math.random(')) {
    console.warn('SPEARHEAD_RUNTIME_PURITY warning', domain, 'time_or_random_reference')
  }
  if (result && typeof result.then === 'function') {
    console.warn('SPEARHEAD_RUNTIME_PURITY warning', domain, 'async_transition_return')
    return
  }
  try {
    const a = transitionFn(deepClone(prevState), deepClone(action))
    const b = transitionFn(deepClone(prevState), deepClone(action))
    if (stableStringify(a) !== stableStringify(b)) {
      console.warn('SPEARHEAD_RUNTIME_PURITY warning', domain, 'nondeterministic_output')
    }
  } catch (e) {
    console.warn('SPEARHEAD_RUNTIME_PURITY warning', domain, 'purity_check_throw', String(e?.message || e))
  }
}