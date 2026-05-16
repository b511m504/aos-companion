export const RUNTIME_VALIDATION_SCENARIO_IDS = [
  "rapid_scan_spam",
  "sequential_scans_500",
  "pause_during_dispatch",
  "duplicate_uid_storm",
  "chaos_visibility_burst",
  "runtime_stress_queue_flood",
  "nfc_runtime_spam_entity"
] as const

export type RuntimeValidationScenarioId = (typeof RUNTIME_VALIDATION_SCENARIO_IDS)[number]

export const RUNTIME_VALIDATION_SCENARIOS: {
  id: RuntimeValidationScenarioId
  title: string
  describe: string
}[] = [
  { id: "rapid_scan_spam", title: "Rapid synthetic scan spam", describe: "80 synthetic tags with yields (NFC pipeline)." },
  { id: "sequential_scans_500", title: "500 sequential UIDs", describe: "Endurance through canonical synthetic events." },
  { id: "pause_during_dispatch", title: "Pause during runtime dispatch", describe: "Toggles runtime pause around a dispatch." },
  { id: "duplicate_uid_storm", title: "Duplicate UID storm", describe: "Same UID repeatedly (debounce / cooldown stress)." },
  { id: "chaos_visibility_burst", title: "Visibility burst", describe: "Synthetic visibilitychange / page events." },
  { id: "runtime_stress_queue_flood", title: "Runtime queue flood", describe: "Uses existing engine stress helper." },
  { id: "nfc_runtime_spam_entity", title: "NFC runtime spam (entity)", describe: "stressNfcSpam on first entity row." }
]
