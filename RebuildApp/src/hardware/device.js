export function getDeviceSummary() {
  // Hardware boundary:
  // This is where device/platform reads can live later (Capacitor plugins, etc.).
  const plat =
    typeof navigator !== 'undefined' && navigator?.platform ? String(navigator.platform) : 'unknown'
  return `Platform: ${plat}`
}
