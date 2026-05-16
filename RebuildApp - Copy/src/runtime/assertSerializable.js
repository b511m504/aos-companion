/**
 * Dev / CI checks that runtime payloads are JSON-safe (no functions, cycles, etc.).
 */

const FORBIDDEN_TYPES = new Set(['function', 'symbol', 'undefined'])

/**
 * @param {unknown} value
 * @param {{ path?: string, maxDepth?: number, maxNodes?: number }} [opts]
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function assertSerializable(value, opts = {}) {
  const errors = []
  const maxDepth = Math.max(1, Number(opts.maxDepth || 32))
  const maxNodes = Math.max(1, Number(opts.maxNodes || 5000))
  let nodes = 0

  function fail(path, reason) {
    errors.push(`${path}: ${reason}`)
  }

  function walk(v, path, depth, seen) {
    if (errors.length >= 50) return
    nodes += 1
    if (nodes > maxNodes) {
      fail(path, 'max_nodes_exceeded')
      return
    }
    if (depth > maxDepth) {
      fail(path, 'max_depth_exceeded')
      return
    }
    const t = typeof v
    if (v === null) return
    if (FORBIDDEN_TYPES.has(t)) {
      fail(path, `forbidden_type_${t}`)
      return
    }
    if (t === 'bigint') {
      fail(path, 'bigint_not_serializable')
      return
    }
    if (t === 'string' || t === 'number' || t === 'boolean') return

    if (v instanceof Promise) {
      fail(path, 'promise_not_serializable')
      return
    }
    if (typeof Element !== 'undefined' && v instanceof Element) {
      fail(path, 'dom_node_not_serializable')
      return
    }
    if (typeof Map !== 'undefined' && v instanceof Map) {
      fail(path, 'map_not_allowed_use_plain_object')
      return
    }
    if (typeof Set !== 'undefined' && v instanceof Set) {
      fail(path, 'set_not_allowed_use_array')
      return
    }

    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i += 1) {
        walk(v[i], `${path}[${i}]`, depth + 1, seen)
      }
      return
    }

    if (t === 'object') {
      if (seen.has(v)) {
        fail(path, 'cyclic_reference')
        return
      }
      seen.add(v)
      const proto = Object.getPrototypeOf(v)
      if (proto !== null && proto !== Object.prototype) {
        const ctor = proto?.constructor?.name
        if (ctor && ctor !== 'Object') {
          fail(path, `class_instance_${ctor}`)
        }
      }
      for (const k of Object.keys(v)) {
        walk(v[k], `${path}.${k}`, depth + 1, seen)
      }
      seen.delete(v)
    }
  }

  walk(value, opts.path || '$', 0, new WeakSet())
  return { ok: errors.length === 0, errors }
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {boolean} true if ok
 */
export function devAssertSerializableOrWarn(value, label = 'payload') {
  try {
    if (!isSerializationAuditEnabled()) return true
    const r = assertSerializable(value, { path: label })
    if (!r.ok) {
      console.warn('SPEARHEAD_SERIALIZATION_AUDIT', label, r.errors.slice(0, 12))
    }
    return r.ok
  } catch (e) {
    console.warn('SPEARHEAD_SERIALIZATION_AUDIT threw', label, String(e?.message || e))
    return false
  }
}

function isSerializationAuditEnabled() {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV === true) return true
  } catch {
    /* ignore */
  }
  try {
    return globalThis.__SPEARHEAD_SERIALIZATION_AUDIT__ === true
  } catch {
    return false
  }
}
