import type { RendererReactiveState } from '../graphicsBackend/types'
import { recordFromWorkerSync } from './workerProxy'

export const RENDERER_PATCH_MESSAGE_TYPE = 'rendererPatch'

export type RendererPatch =
  | { op: 'chunkLoaded', key: string }
  | { op: 'heightmap', key: string, buffer: ArrayBuffer }
  | { op: 'heightmapRemove', key: string }
  | { op: 'set', path: string, value: unknown }

export type RendererPatchMessage = {
  type: typeof RENDERER_PATCH_MESSAGE_TYPE
  patch: RendererPatch
}

export const isRendererPatchWorkerContext = (): boolean => {
  return typeof window === 'undefined' && typeof self !== 'undefined'
}

export const emitRendererPatch = (patch: RendererPatch, transfer: Transferable[] = []): void => {
  if (!isRendererPatchWorkerContext()) return
  const message: RendererPatchMessage = { type: RENDERER_PATCH_MESSAGE_TYPE, patch }
  // eslint-disable-next-line no-restricted-globals
  ;(self as unknown as DedicatedWorkerGlobalScope).postMessage(message, transfer)
}

export const notifyRendererPatch = (patch: RendererPatch, transfer: Transferable[] = []): void => {
  emitRendererPatch(patch, transfer)
}

const setByPath = (target: Record<string, unknown>, path: string, value: unknown) => {
  const parts = path.split('.')
  let cur: Record<string, unknown> = target
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cur[parts[i]]
    if (next == null || typeof next !== 'object') {
      cur[parts[i]] = {}
    }
    cur = cur[parts[i]] as Record<string, unknown>
  }
  cur[parts[parts.length - 1]!] = value
}

export const applyRendererPatch = (state: RendererReactiveState, patch: RendererPatch): void => {
  switch (patch.op) {
    case 'chunkLoaded':
      state.world.chunksLoaded[patch.key] = true
      break
    case 'heightmap':
      state.world.heightmaps[patch.key] = new Int16Array(patch.buffer)
      break
    case 'heightmapRemove':
      delete state.world.heightmaps[patch.key]
      break
    case 'set':
      setByPath(state as unknown as Record<string, unknown>, patch.path, patch.value)
      break
    default:
      break
  }
}

const commitRendererPatch = (state: RendererReactiveState, patch: RendererPatch, transfer: Transferable[] = []) => {
  applyRendererPatch(state, patch)
  notifyRendererPatch(patch, transfer)
}

export const markChunkLoaded = (state: RendererReactiveState, key: string) => {
  commitRendererPatch(state, { op: 'chunkLoaded', key })
}

export const setRendererHeightmap = (state: RendererReactiveState, key: string, data: Int16Array) => {
  state.world.heightmaps[key] = data
  if (!isRendererPatchWorkerContext()) return
  const transfer = data.slice()
  notifyRendererPatch({ op: 'heightmap', key, buffer: transfer.buffer }, [transfer.buffer])
}

export const removeRendererHeightmap = (state: RendererReactiveState, key: string) => {
  commitRendererPatch(state, { op: 'heightmapRemove', key })
}

export const setRendererField = (state: RendererReactiveState, path: string, value: unknown) => {
  commitRendererPatch(state, { op: 'set', path, value })
}

export const installRendererPatchHandler = (worker: Worker, rendererState: RendererReactiveState): void => {
  worker.addEventListener('message', (event: MessageEvent<RendererPatchMessage>) => {
    const data = event.data
    if (data?.type !== RENDERER_PATCH_MESSAGE_TYPE) return
    applyRendererPatch(rendererState, data.patch)
    recordFromWorkerSync()
  })
}

export const countChunksLoaded = (chunksLoaded: Record<string, true>): number => {
  return Object.keys(chunksLoaded).length
}

export const isChunkLoaded = (chunksLoaded: Record<string, true>, key: string): boolean => {
  return chunksLoaded[key] === true
}
