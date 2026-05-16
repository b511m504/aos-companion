# Runtime platform clean (`runtime-platform-clean/`)

This folder is a **fresh Capacitor 8 + Android host** for the tabletop NFC runtime. It **does not reuse** the legacy `android/` tree, old manifests, NFC intent routing, `@exxili/capacitor-nfc`, or foreground-dispatch wiring from the contaminated stack.

## Architecture summary

| Layer | Responsibility |
|--------|----------------|
| **Web (Vite + React)** | UI, Zustand, TS runtime engine, `NFCManager` — migrated from `nfc-companion/src`, `public/`, and configs. |
| **Capacitor** | WebView shell, asset loading, `@capacitor/app` only (no NFC plugins). |
| **Android — single activity** | `MainActivity` (`singleTask`): lifecycle hooks only. |
| **Android — NFC** | `CleanNfcBridge`: **ReaderMode only** while resumed; debounce; canonical JSON to JS. |

### NFC transport (exactly one)

1. **`NfcAdapter.enableReaderMode`** with `FLAG_READER_SKIP_NDEF_CHECK` plus standard reader tech flags (A/B/F/V, barcode on Q+).  
2. **Reader callback** is the **only** tag delivery path in this app. There is **no** `enableForegroundDispatch`, **no** `onNewIntent` NFC branch, and **no** `TAG_DISCOVERED` / `TECH_DISCOVERED` intent filters in the manifest.

### Native → JS bridge (no plugin abstraction)

`Bridge.triggerWindowJSEvent` is used directly from `CleanNfcBridge`:

- **Success:** `aosNativeNfcTag`  
- **Error:** `aosNativeNfcScanError`  

**Canonical tag payload** (JSON object literal, second argument to `triggerWindowJSEvent`):

```json
{
  "uid": "HEX_OR_SYNTHETIC",
  "synthetic": false,
  "technologies": ["android.nfc.tech.NfcA"],
  "messages": [{ "records": [{ "type": "T", "payload": "base64..." }] }],
  "timestamp": 1710000000000,
  "transport": "reader_mode"
}
```

`NFCManager` accepts **top-level `uid`** (preferred) or legacy **`tagInfo.uid`** for older payloads.

### Lifecycle (deterministic)

- **`onResume` (after `super.onResume`)**: flush any JS events queued before the bridge existed, then **enable ReaderMode**.  
- **`onPause` (before `super.onPause`)**: **disable ReaderMode** so the NFC controller is not left in reader state across background transitions.

### Why this differs from the previous stack

| Previous / contaminated patterns | This clean build |
|----------------------------------|------------------|
| Layered Capacitor NFC plugins, Cordova remnants, vendor patches | **Zero** third-party NFC plugins |
| Manifest high-priority tag intents + FD + ReaderMode (multiple paths, replay, races) | **ReaderMode only**; **no** NFC intent filters |
| Plugin scan queues and bridge timing artifacts | **One** native module; queue only while `bridge == null` |
| `onNewIntent` NFC handling and intent neutralization complexity | **No** NFC intents to the activity for tags |

### Verification checklist (manual)

1. **One transport:** from `android/`, run `rg "enableForegroundDispatch|TAG_DISCOVERED|TECH_DISCOVERED|exxili" --glob "*.kt" --glob "*.java" --glob "*.xml"` — expect **no matches**.  
2. **ReaderMode primary:** `CleanNfcBridge` logs `reader_mode_enabled` / `reader_mode_disabled`; callback logs `emitted_tag`.  
3. **Manifest:** only `MAIN`/`LAUNCHER` on the activity; **no** NFC `<intent-filter>`.  
4. **Runtime:** open app → tap tag → response **only** in-app; no duplicate launches from tag intents (cold launch **from** a tag while the app is not running is **not** wired — deliberate trade-off for determinism).

## NFC validation overlay (timing / OEM proof)

- **When enabled:** Vite `import.meta.env.DEV`, or `VITE_NFC_VALIDATION_HUD=true`, or one navigation with `?nfcValidate=1` / `?nfc_diag=1` (stored in `sessionStorage` for that WebView session).  
- **Native events:** `aosNativeNfcReaderProbe` (every ReaderMode callback: `callback_entry`, then `debounced_skip` if applicable), `aosNativeNfcTransportState` (reader enabled/disabled), plus existing `aosNativeNfcTag` / `aosNativeNfcScanError`. Canonical tag payloads include `nativeCallbackUptimeMs` (same clock as probe entry).  
- **JS:** `installNfcValidationListeners.ts` is imported **first** from `main.tsx`. It registers **capture-phase** `window` listeners so flash + vibration + timeline updates run **before** `NFCManager` bubble handlers and game routing.  
- **UI:** Floating `NfcValidationHud` + Settings / `#nfc_validation` / `?launch=nfc_validation` opens `NfcValidationChecklistScreen` with locally persisted pass/fail rows (`nfc_validation_checklist_v1`).  
- **Android:** `VIBRATE` permission added for `navigator.vibrate` from the WebView.

## `nfcPure` isolation APK (ReaderMode-only experiment)

Gradle **buildType** `nfcPure` (installs as **`com.runtimeplatform.clean.nfc_pure`**):

- `BuildConfig.NFC_PURE_EXPERIMENT == true` → logcat tag **`NFC_PURE_MODE`** with `[NFC_PURE_MODE] …` lines from `MainActivity` + `CleanNfcBridge`.
- **`MainActivity.onNewIntent`**: if an NFC **dispatch** intent (`TAG_DISCOVERED` / `TECH_DISCOVERED` / `NDEF_DISCOVERED`) still reaches the activity, it is **consumed** and **not** passed to `BridgeActivity` / Capacitor (only on this build).
- Native transport JSON includes **`PURE_READERMODE_TEST`** for the validation HUD.

**Assemble (Windows):** `npm run android:assemble-nfc-pure` from `runtime-platform-clean/` (requires `JAVA_HOME` + Android SDK). On macOS/Linux use `cd android && ./gradlew assembleNfcPure` after `npm run build && npx cap sync android`.

**Regular `debug` / `release`:** `NFC_PURE_EXPERIMENT` is `false`; `onNewIntent` forwards normally (still no manifest NFC intent filters in this project).

## Build note

`./gradlew assembleDebug` requires **JDK 21** and **`JAVA_HOME`** set (Android Studio’s embedded JRE is fine).

## Setup

From `runtime-platform-clean/`:

```bash
npm install
npm run build
npx cap sync android
```

Then open `android/` in Android Studio or run `./gradlew assembleDebug` inside `android/`.

- **`www/`** is build output (Vite `outDir`); run `npm run build` before `cap sync`.  
- **`android/app/src/main/assets/capacitor.config.json`** is kept in-repo for visibility; `cap sync` refreshes it from `capacitor.config.ts`.

## Trade-offs (determinism over backward compatibility)

- **No cold NFC URL dispatch** into the app via manifest (no tag intent filters). Tags are handled **only** when the app is foreground and ReaderMode is active.  
- **No** foreground-dispatch fallback if ReaderMode were disabled on a device (not used here).
