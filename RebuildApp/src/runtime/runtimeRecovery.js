/**
 * Controlled runtime recovery hooks.
 * Returns a patch that can be applied via updateState, or null.
 */
export function attemptRuntimeRecovery({ reason, action, runtimeEpoch }) {
  const r = String(reason || '')
  if (r.includes('stale_epoch_rejected')) {
    return {
      patch: {
        runtimeGateWarning: 'Runtime action dropped due to stale epoch.',
      },
      label: 'runtime recovery: stale epoch',
    }
  }
  if (r.includes('assigned_tag_mismatch') || r.includes('corrupted_assignment')) {
    return {
      patch: {
        runtimeGateWarning: 'Recovered from assignment mapping mismatch.',
      },
      label: 'runtime recovery: assignment mismatch',
    }
  }
  if (r.includes('checkpoint_divergence')) {
    return {
      patch: {
        runtimeGateWarning: 'Replay divergence detected; runtime transitions temporarily frozen.',
      },
      label: 'runtime recovery: replay divergence',
      freezeTransitions: true,
    }
  }
  if (r.includes('invalid_package_state')) {
    return {
      patch: {
        runtimeGateWarning: 'Invalid package state detected; transition skipped.',
      },
      label: 'runtime recovery: invalid package',
    }
  }
  return {
    patch: {
      runtimeGateWarning: `Runtime recovery applied: ${r || 'unknown reason'}`,
    },
    label: 'runtime recovery: generic',
  }
}

