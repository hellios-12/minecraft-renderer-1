import { describe, expect, it, vi } from 'vitest'
import { proxy } from 'valtio'
import * as workerProxy from './workerProxy'
import {
  applyRendererPatch,
  countChunksLoaded,
  installRendererPatchHandler,
  isChunkLoaded,
  markChunkLoaded,
  setRendererField,
} from './rendererStateBridge'
import type { RendererReactiveState } from '../graphicsBackend/types'
import { defaultPerformanceInstabilityFactors } from '../performanceMonitor'

const makeState = (): RendererReactiveState => proxy({
  world: {
    chunksLoaded: {},
    heightmaps: {},
    allChunksLoaded: false,
    mesherWork: false,
    instabilityFactors: defaultPerformanceInstabilityFactors(),
    intersectMedia: null
  },
  renderer: '...',
  preventEscapeMenu: false
})

describe('rendererStateBridge', () => {
  it('applies chunkLoaded patch', () => {
    const state = makeState()
    applyRendererPatch(state, { op: 'chunkLoaded', key: '1,2' })
    expect(isChunkLoaded(state.world.chunksLoaded, '1,2')).toBe(true)
    expect(countChunksLoaded(state.world.chunksLoaded)).toBe(1)
  })

  it('applies heightmap patch', () => {
    const state = makeState()
    const buffer = new Int16Array([1, 2, 3]).buffer
    applyRendererPatch(state, { op: 'heightmap', key: '0,0', buffer })
    expect(state.world.heightmaps['0,0']).toEqual(new Int16Array([1, 2, 3]))
  })

  it('applies set patch for nested fields', () => {
    const state = makeState()
    applyRendererPatch(state, { op: 'set', path: 'world.mesherWork', value: true })
    expect(state.world.mesherWork).toBe(true)
  })

  it('markChunkLoaded mutates state', () => {
    const state = makeState()
    markChunkLoaded(state, '3,4')
    expect(isChunkLoaded(state.world.chunksLoaded, '3,4')).toBe(true)
    expect(countChunksLoaded(state.world.chunksLoaded)).toBe(1)
  })

  it('setRendererField sets nested path', () => {
    const state = makeState()
    setRendererField(state, 'world.mesherWork', true)
    expect(state.world.mesherWork).toBe(true)
  })

  it('markChunkLoaded does not throw outside worker context', () => {
    const state = makeState()
    expect(() => markChunkLoaded(state, '0,0')).not.toThrow()
  })

  it('installRendererPatchHandler records fromWorker sync', () => {
    const recordSpy = vi.spyOn(workerProxy, 'recordFromWorkerSync')
    const state = makeState()
    const listeners: Array<(event: MessageEvent) => void> = []
    const worker = {
      addEventListener: (_type: string, listener: (event: MessageEvent) => void) => {
        listeners.push(listener)
      },
    } as unknown as Worker

    installRendererPatchHandler(worker, state)

    listeners[0]!({
      data: { type: 'rendererPatch', patch: { op: 'chunkLoaded', key: '1,1' } },
    } as MessageEvent)

    expect(isChunkLoaded(state.world.chunksLoaded, '1,1')).toBe(true)
    expect(recordSpy).toHaveBeenCalledOnce()
    recordSpy.mockRestore()
  })
})
