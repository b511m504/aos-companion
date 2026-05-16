/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** When `"true"`, enables NFC validation HUD + listeners in production builds (plus `?nfcValidate=1`). */
  readonly VITE_NFC_VALIDATION_HUD?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
