import { recordSelectorPerf } from '../runtimePerf.js'
import { recordSelectorInvalidate } from '../runtimeSelectorInstrumentation.js'

export function createSelector(name, inputFn, projectFn) {
  let lastSig = ''
  let lastValue = null
  return (state) => {
    const t0 = performance.now()
    const input = inputFn(state)
    const sig = JSON.stringify(input)
    if (sig === lastSig) {
      recordSelectorInvalidate(name, false)
      recordSelectorPerf(name, performance.now() - t0)
      return lastValue
    }
    lastSig = sig
    lastValue = projectFn(input)
    recordSelectorInvalidate(name, true)
    recordSelectorPerf(name, performance.now() - t0)
    return lastValue
  }
}

