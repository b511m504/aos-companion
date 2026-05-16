/**
 * Builds the NFC companion (Vite → www/) and merges legacy static assets for Capacitor.
 */
import { spawnSync } from "node:child_process"
import * as esbuild from "esbuild"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")
const www = path.join(root, "www")
const companion = path.join(root, "nfc-companion")

function rmrf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
}

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm"

const syncPkgs = path.join(root, "scripts", "sync-packages-to-companion-public.mjs")
if (fs.existsSync(syncPkgs)) {
  const { status } = spawnSync(process.execPath, [syncPkgs], { cwd: root, stdio: "inherit" })
  if (status !== 0) {
    console.error("[sync-cap-web] sync-packages-to-companion-public failed")
    process.exit(status ?? 1)
  }
}

if (!fs.existsSync(path.join(companion, "node_modules"))) {
  console.log("[sync-cap-web] Installing nfc-companion dependencies…")
  const inst = spawnSync(npmCmd, ["install"], { cwd: companion, stdio: "inherit", env: process.env })
  if (inst.status !== 0) {
    console.error("[sync-cap-web] npm install failed in nfc-companion")
    process.exit(inst.status ?? 1)
  }
}

rmrf(www)

const build = spawnSync(npmCmd, ["run", "build"], {
  cwd: companion,
  stdio: "inherit",
  env: process.env
})

if (build.status !== 0) {
  console.error("[sync-cap-web] nfc-companion build failed")
  process.exit(build.status ?? 1)
}

if (!fs.existsSync(path.join(www, "index.html"))) {
  console.error("[sync-cap-web] Missing www/index.html after Vite build")
  process.exit(1)
}

const indexHtml = fs.readFileSync(path.join(www, "index.html"), "utf8")
fs.writeFileSync(path.join(www, "404.html"), indexHtml)
console.log("[sync-cap-web] Wrote www/404.html from www/index.html")

const sw = path.join(root, "sw.js")
if (fs.existsSync(sw)) {
  fs.copyFileSync(sw, path.join(www, "sw.js"))
}

const iconsSrc = path.join(root, "icons")
const iconsDst = path.join(www, "icons")
if (fs.existsSync(iconsSrc)) {
  fs.cpSync(iconsSrc, iconsDst, { recursive: true })
  console.log("[sync-cap-web] Copied icons/ → www/icons/")
} else {
  console.warn("[sync-cap-web] Missing icons/ — manifest icons may 404")
}

const structuredSrc = path.join(root, "structured")
const structuredDst = path.join(www, "structured")
if (fs.existsSync(structuredSrc)) {
  fs.cpSync(structuredSrc, structuredDst, { recursive: true })
}

const packagesSrc = path.join(root, "packages")
const packagesDst = path.join(www, "packages")
if (fs.existsSync(packagesSrc)) {
  fs.cpSync(packagesSrc, packagesDst, { recursive: true })
  console.log("[sync-cap-web] Copied packages/ → www/packages/")
}

const deeplinkEntry = path.join(root, "scripts", "capacitor-deeplink-entry.mjs")
const deeplinkOut = path.join(www, "capacitor-app-iife.js")
await esbuild.build({
  absWorkingDir: root,
  entryPoints: [deeplinkEntry],
  outfile: deeplinkOut,
  bundle: true,
  format: "iife",
  platform: "browser"
})

console.log("SYNC COMPLETE — www/ is ready (Capacitor copies from www/)")
