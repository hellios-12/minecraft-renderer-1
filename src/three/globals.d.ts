import type { IndexedData } from 'minecraft-data'
import type * as ThreeTypes from 'three'
import type { AppViewer } from '../graphicsBackend/appViewer'
import type { WorldRendererThree } from './worldRendererThree'

declare global {
  interface GlobalThis {
    loadedData: IndexedData
    mcData: IndexedData
    appViewer: AppViewer
    includedVersions: string[]
    THREE: typeof ThreeTypes
  }

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
}

export {}
