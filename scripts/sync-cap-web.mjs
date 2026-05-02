/**
 * Copies static web assets into www/ for Capacitor (avoids bundling node_modules).
 */
import * as esbuild from "esbuild"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")
const www = path.join(root, "www")

function rmrf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
}

rmrf(www)
fs.mkdirSync(www, { recursive: true })

const files = ["manifest.json", "sw.js"]
for (const f of files) {
  const src = path.join(root, f)
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(www, f))
}

const indexSrc = path.join(root, "index.html")
if (!fs.existsSync(indexSrc)) {
  console.error("Missing index.html")
  process.exit(1)
}
const indexHtml = fs.readFileSync(indexSrc, "utf8")
fs.writeFileSync(path.join(www, "index.html"), indexHtml)
fs.writeFileSync(path.join(www, "404.html"), indexHtml)

const viewerRedirect = path.join(root, "viewer.html")
if (fs.existsSync(viewerRedirect)) {
  fs.copyFileSync(viewerRedirect, path.join(www, "viewer.html"))
}

const structuredSrc = path.join(root, "structured")
const structuredDst = path.join(www, "structured")
if (fs.existsSync(structuredSrc)) {
  fs.cpSync(structuredSrc, structuredDst, { recursive: true })
}

const iconsSrc = path.join(root, "icons")
const iconsDst = path.join(www, "icons")
if (fs.existsSync(iconsSrc)) {
  fs.cpSync(iconsSrc, iconsDst, { recursive: true })
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

console.log("Synced web assets to www/")
