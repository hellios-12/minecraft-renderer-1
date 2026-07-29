import type { IndexedData } from 'minecraft-data'
import type * as ThreeTypes from 'three'
import type { AppViewer } from '../graphicsBackend/appViewer'
import type { WorldRendererThree } from './worldRendererThree'

declare global {
  var loadedData: IndexedData
  var mcData: IndexedData
  var appViewer: AppViewer
  var includedVersions: string[]
  var THREE: typeof ThreeTypes
  interface Window {
    loadedData: IndexedData
    mcData: IndexedData
    appViewer: AppViewer
    includedVersions: string[]
    THREE: typeof ThreeTypes
    world?: WorldRendererThree
  }
}

export {}
