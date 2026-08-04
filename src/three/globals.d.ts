import type { IndexedData } from 'minecraft-data'
import type * as ThreeTypes from 'three'
import type { AppViewer } from '../graphicsBackend/appViewer'
import type { WorldRendererThree } from './worldRendererThree'

// NOTE: `AppLoadedData` (loadedData's type) and the other globals below must
// match minecraft-web-client's src/globals.d.ts EXACTLY - same identifiers,
// same type text. TypeScript merges `declare global { var x }` declarations
// across packages and ERRORS (or silently produces wrong types) if two
// packages declare the same global with different types. Keep these two
// files in lockstep whenever either one changes.
//
// Do NOT try to add fields to IndexedData via `declare module 'minecraft-data'
// { interface IndexedData {...} }` - minecraft-data's real ambient types use
// `export =` (CommonJS) semantics, and augmenting from a non-module ambient
// file shadows the real declaration instead of merging with it, which wipes
// out every real IndexedData property. Use an intersection type instead, as
// below.
type AppLoadedData = IndexedData & { sounds: Record<string, { id: number, name: string }> }

declare global {
  interface Window {
    loadedData: AppLoadedData
    mcData: IndexedData
    appViewer: AppViewer
    includedVersions: string[]
    THREE: typeof ThreeTypes
    world?: WorldRendererThree
  }

  namespace NodeJS {
    interface Global {
      loadedData: AppLoadedData
      mcData: IndexedData
      appViewer: AppViewer
      includedVersions: string[]
      THREE: typeof ThreeTypes
    }
  }

  var loadedData: AppLoadedData
  var mcData: IndexedData
  var appViewer: AppViewer
  var includedVersions: string[]
  var THREE: typeof ThreeTypes
}

export {}
