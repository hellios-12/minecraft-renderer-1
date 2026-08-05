import { IndexedData } from 'minecraft-data'

declare global {
  var loadedData: IndexedData | undefined
  var appViewer: any
}

// Ensure this is treated as a module augmentation
export {}
