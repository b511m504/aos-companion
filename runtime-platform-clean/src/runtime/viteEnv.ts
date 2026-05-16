/** Vite injects `import.meta.env`; plain Node (simulation CLI, tooling) does not. */
export function viteBaseUrl(): string {
  const m = import.meta as ImportMeta & { env?: { BASE_URL?: string } }
  const b = m.env?.BASE_URL
  return typeof b === "string" && b.length > 0 ? b : "./"
}
