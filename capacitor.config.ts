import type { CapacitorConfig } from "@capacitor/cli"

const config: CapacitorConfig = {
  appId: "com.aos.app",
  appName: "AoS Companion",
  /** Bundled static assets (sync from repo root via `npm run cap:sync-web`) — not `.` to avoid shipping node_modules. */
  webDir: "www",
  server: {
    androidScheme: "https"
  }
}

export default config
