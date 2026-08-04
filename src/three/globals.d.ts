import type { IndexedData } from 'minecraft-data'
import type * as ThreeTypes from 'three'
import type { AppViewer } from '../graphicsBackend/appViewer'
import type { WorldRendererThree } from './worldRendererThree'

// `sounds` is added to IndexedData by the consuming app (minecraft-web-client's
// src/globals.d.ts) via the same module augmentation below. Declaring it here
// too keeps this package typecheckable standalone (unit tests / playground
// build) without needing a separate intersection type that could drift out
// of sync with the host app's version.
declare module 'minecraft-data' {
  interface IndexedData {
    sounds: Record<string, { id: number; name: string }>
  }
}

declare global {
  interface Window {
    loadedData: IndexedData
    mcData: IndexedData
    appViewer: AppViewer
    includedVersions: string[]
    THREE: typeof ThreeTypes
    world?: WorldRendererThree
  }

  namespace NodeJS {
    interface Global {
      loadedData: IndexedData
      mcData: IndexedData
      appViewer: AppViewer
      includedVersions: string[]
      THREE: typeof ThreeTypes
    }
  }

  // NOTE: these must match minecraft-web-client's src/globals.d.ts EXACTLY
  // (same identifiers, same types). TypeScript merges `declare global { var x }`
  // declarations across packages and ERRORS if two packages declare the same
  // global with different types - that mismatch (IndexedData vs
  // IndexedData & { sounds }) was the actual cause of the TS2339
  // "Property does not exist on type 'typeof globalThis'" errors. Keep these
  // two files in lockstep whenever either one changes.
  var loadedData: IndexedData
  var mcData: IndexedData
  var appViewer: AppViewer
  var includedVersions: string[]
  var THREE: typeof ThreeTypes
}

export {}
