let nowImpl = () => Date.now()

export const runtimeClock = {
  now() {
    return Number(nowImpl())
  },
}

export function setRuntimeClockNow(fn) {
  if (typeof fn === 'function') nowImpl = fn
}

export function resetRuntimeClockNow() {
  nowImpl = () => Date.now()
}

