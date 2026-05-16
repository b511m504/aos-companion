export const NFC_TRACE = Object.freeze({
  ANDROID_EVENT: 'NFC_ANDROID_EVENT',
  TAG_RECEIVED: 'NFC_TAG_RECEIVED',
  UNIT_SELECTED: 'UNIT_SELECTED',
  ASSIGNMENT_CREATED: 'ASSIGNMENT_CREATED',
  ASSIGNMENT_CLEARED: 'ASSIGNMENT_CLEARED',
})

export function logNfcTrace(type, ...payload) {
  console.debug('SPEARHEAD_NFC_TRACE', type, ...payload)
}
