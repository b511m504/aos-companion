import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Packaged-only policy (no live reload / no external dev shell):
 *
 * - Never set `server.url`, `cleartext`, `liveReload`, or dev `allowNavigation` here.
 * - Do not run `cap sync` with Ionic/Capacitor env flags that inject a dev server into generated `android/.../capacitor.config.json`.
 * - Rebuild + sync after any config change; uninstall the app from the device; `cd android && ./gradlew clean`; install with `npx cap run android` (no `--external`, no dev server).
 *
 * Capacitor 8 defaults `server.androidScheme` to **`https`**, which makes the Android WebView report **`https://localhost/`** for *packaged* local assets (secure context). That is not the same as a LAN Vite URL, but if you require a non-`https` local scheme for bridge diagnostics, set `androidScheme` below (see Capacitor docs: non-http(s) schemes can affect routing on WebView 117+).
 */
const config: CapacitorConfig = {
  appId: 'com.example.rebuildapp',
  appName: 'RebuildApp',
  /** Built web assets only — must run `npm run build` before `npx cap sync`. */
  webDir: 'dist',
  /**
   * Explicit local schemes only — **no** `url`, **no** `cleartext`, **no** `hostname` override to a dev machine.
   * Prefer `capacitor` on Android to aim for `capacitor://localhost`-style origins; revert to `https` (or `http`) if routing breaks per project needs.
   */
  server: {
    androidScheme: 'capacitor',
    iosScheme: 'capacitor',
  },
};

export default config;
