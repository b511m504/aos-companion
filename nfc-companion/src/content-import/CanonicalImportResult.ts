import type { ArmyList } from "@/models/types"
import type { CanonicalImportGraph } from "@/content-import/ImportTypes"

export type ImportNormalizationMetrics = {
  entityCount: number
  edgeCount: number
  durationMs: number
}

export type CanonicalImportResult =
  | {
      ok: true
      packageId: string
      adapterKind: string
      graph: CanonicalImportGraph
      list: ArmyList
      metrics: ImportNormalizationMetrics
    }
  | {
      ok: false
      packageId: string
      adapterKind: string
      errors: string[]
      metrics?: Partial<ImportNormalizationMetrics>
    }
