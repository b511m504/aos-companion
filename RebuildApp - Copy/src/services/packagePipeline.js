/**
 * IMPORT → normalize → runtime entity graph (single pipeline).
 * Raw JSON never lands in store as the authority — only processed registry output.
 */
import { resolveSystemAdapter } from '../systems/registry.js'
import { cardTrace, cardTraceFailure } from '../diagnostics/packageCardInteractionTrace.js'
import { resolveBuiltInPackageUrl } from './builtInPackages.js'

function traceStore() {
  return typeof globalThis.__SPEARHEAD_STORE_GET__ === 'function'
    ? globalThis.__SPEARHEAD_STORE_GET__()
    : {}
}

/**
 * @param {object} raw — parsed JSON (content package)
 * @param {{ sourceLabel?: string }} [ctx]
 * @returns {{ ok: boolean, error?: string, runtimeRegistry?: object }}
 */
export function processRawPackageJson(raw, ctx = {}) {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Invalid package' }
  }

  const systemKey =
    /** @type {{ systemId?: string, gameSystem?: string }} */ (raw).systemId ||
    /** @type {{ gameSystem?: string }} */ (raw).gameSystem ||
    'generic'

  const adapter = resolveSystemAdapter(systemKey)
  const v = adapter.validatePackage(raw)
  if (!v.ok) {
    return { ok: false, error: (v.errors && v.errors[0]) || 'Validation failed' }
  }

  const normalized = adapter.normalizePackage(raw)
  const entities = adapter.buildRuntimeEntities(normalized)
  const graphRelationships = collectGraphRelationships(normalized, entities)

  const listName = normalized.listName || ctx.sourceLabel || 'List'

  return {
    ok: true,
    runtimeRegistry: {
      entities,
      relationships: graphRelationships,
      metadata: {
        listName,
        systemId: adapter.systemId,
        sourceLabel: ctx.sourceLabel ?? listName,
        contentPackageVersion: /** @type {{ version?: string }} */ (raw).version ?? null,
      },
    },
  }
}

function collectGraphRelationships(normalized, entities) {
  const fromPackage = Array.isArray(normalized.relationships) ? normalized.relationships : []
  const ids = new Set(entities.map((e) => e.entityId))
  const cleaned = []
  for (const r of fromPackage) {
    if (!r || typeof r !== 'object') continue
    const type = String(r.type ?? 'link')
    const source = String(r.source ?? '')
    const target = String(r.target ?? '')
    if (!source || !target || !ids.has(source) || !ids.has(target)) continue
    cleaned.push({ type, source, target })
  }
  return cleaned
}

/**
 * Fetch a built-in list by key (demo armies).
 * @param {string} packageKey
 * @returns {Promise<object | null>}
 */
export async function fetchBuiltInPackageJson(packageKey) {
  const t0 = performance.now()
  const url = resolveBuiltInPackageUrl(packageKey)
  cardTrace('CARD_PACKAGE_FETCH_START', traceStore, {
    packageId: packageKey,
    resolvedAssetPath: url || '(null — unknown package key)',
    action: 'fetchBuiltInPackageJson',
    eventType: 'fetch',
  })

  if (!url) {
    cardTraceFailure('CARD_PACKAGE_FETCH_FAILED', traceStore, {
      packageId: packageKey,
      resolvedAssetPath: null,
      fetchStatus: 'no_url_mapping',
      durationMs: Math.round(performance.now() - t0),
    })
    return null
  }

  let response
  try {
    response = await fetch(url)
  } catch (err) {
    cardTraceFailure('CARD_PACKAGE_FETCH_FAILED', traceStore, {
      packageId: packageKey,
      resolvedAssetPath: url,
      fetchStatus: 'network_throw',
      error: String(err?.message ?? err),
      stack: err?.stack,
      durationMs: Math.round(performance.now() - t0),
    })
    throw err
  }

  if (!response.ok) {
    cardTraceFailure('CARD_PACKAGE_FETCH_FAILED', traceStore, {
      packageId: packageKey,
      resolvedAssetPath: url,
      fetchStatus: `http_${response.status}`,
      durationMs: Math.round(performance.now() - t0),
    })
    return null
  }

  cardTrace('CARD_PACKAGE_FETCH_SUCCESS', traceStore, {
    packageId: packageKey,
    resolvedAssetPath: url,
    fetchStatus: `http_${response.status}`,
    durationMs: Math.round(performance.now() - t0),
  })

  let rawJson
  try {
    rawJson = await response.json()
  } catch (err) {
    cardTraceFailure('CARD_PACKAGE_FETCH_FAILED', traceStore, {
      packageId: packageKey,
      resolvedAssetPath: url,
      fetchStatus: 'response_json_parse_failed',
      error: String(err?.message ?? err),
      stack: err?.stack,
      durationMs: Math.round(performance.now() - t0),
    })
    return null
  }

  cardTrace('CARD_PACKAGE_PARSE_SUCCESS', traceStore, {
    packageId: packageKey,
    resolvedAssetPath: url,
    jsonParseStatus: 'response_json_ok',
    durationMs: Math.round(performance.now() - t0),
  })

  return rawJson
}
