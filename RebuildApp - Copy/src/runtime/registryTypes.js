/** @typedef {import('./runtimeEntityFactory.js').RuntimeEntity} RuntimeEntity */

/**
 * @typedef {{
 *   entities: RuntimeEntity[],
 *   relationships: Array<{ type: string, source: string, target: string }>,
 *   metadata: {
 *     listName: string,
 *     systemId: string,
 *     sourceLabel?: string,
 *     contentPackageVersion?: string | null,
 *   }
 * }} RuntimeRegistry
 */

export {}
