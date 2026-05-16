import type { CapacitorConfig } from "@capacitor/cli"

const config: CapacitorConfig = {
  appId: "com.runtimeplatform.clean",
  appName: "Runtime NFC Clean",
  webDir: "www",
  server: {
    androidScheme: "https"
  }
}

export default config
