Workspace game packages (JSON only — no engine logic).

- Each subfolder is one game stand-in: warhammer40k, age_of_sigmar, kill_team, crypt_assault, legends_rpg.
- manifests use the shared schema in manifest.json (packageId, name, version, supportsNFC, entityTypes, plus systemId for the NFC companion catalog).
- Rules are merged at runtime via nfc-companion after `npm run sync:nfc-packages` (copies this tree to `nfc-companion/public/packages/` and regenerates package_registry.json).

Regenerate JSON from the generator script:

  node scripts/gen-nfc-packages.mjs

Then sync for local dev:

  npm run sync:nfc-packages
