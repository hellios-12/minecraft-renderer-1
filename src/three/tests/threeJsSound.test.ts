import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockSetVolume = vi.fn()
const mockPlay = vi.fn()
const loadAsyncDeferreds: Array<{ resolve: (buffer: unknown) => void }> = []

vi.mock('three', () => {
  class MockPositionalAudio {
    panner = {
      distanceModel: '',
      refDistance: 0,
      rolloffFactor: 0,
      maxDistance: 0,
      positionX: { setValueAtTime: vi.fn() },
      positionY: { setValueAtTime: vi.fn() },
      positionZ: { setValueAtTime: vi.fn() }
    }

    position = { set: vi.fn() }
    matrixWorld = { decompose: vi.fn() }
    setBuffer = vi.fn()
    setVolume = mockSetVolume
    setPlaybackRate = vi.fn()
    play = mockPlay
    updateMatrixWorld = vi.fn()
    onEnded: (() => void) | undefined
    source = null
    disconnect = vi.fn()
  }

  class MockAudioListener {
    context = { currentTime: 0 }
    removeFromParent = vi.fn()
  }

  class MockAudioLoader {
    manager = { itemEnd: vi.fn() }
    loadAsync() {
      return new Promise(resolve => {
        loadAsyncDeferreds.push({ resolve })
      })
    }
  }

  class MockVector3 {
    x = 0
    y = 0
    z = 0
    set = vi.fn()
  }

  return {
    PositionalAudio: MockPositionalAudio,
    AudioListener: MockAudioListener,
    AudioLoader: MockAudioLoader,
    Vector3: MockVector3,
    Quaternion: class {}
  }
})

import { ThreeJsSound } from '../threeJsSound'

function makeWorldRenderer() {
  return {
    onWorldSwitched: [] as Array<() => void>,
    onReactiveConfigUpdated: vi.fn(),
    camera: { add: vi.fn() },
    cameraWorldPos: { x: 0, y: 64, z: 0 },
    sceneOrigin: {
      addAndTrack: vi.fn(),
      removeAndUntrack: vi.fn()
    }
  }
}

describe('ThreeJsSound', () => {
  beforeEach(() => {
    mockSetVolume.mockClear()
    mockPlay.mockClear()
    loadAsyncDeferreds.length = 0
  })

  it('applies master volume 0 then unmute without NaN', async () => {
    const soundSystem = new ThreeJsSound(makeWorldRenderer() as any)
    soundSystem.baseVolume = 0
    soundSystem.playSound({ x: 1, y: 2, z: 3 }, '/test.mp3', 1)

    loadAsyncDeferreds[0].resolve({})
    await Promise.resolve()

    expect(mockSetVolume).toHaveBeenLastCalledWith(0)

    soundSystem.changeVolume(1)
    expect(mockSetVolume).toHaveBeenLastCalledWith(1)
    expect(Number.isNaN(mockSetVolume.mock.calls.at(-1)?.[0])).toBe(false)
  })

  it('uses current master volume after async load completes', async () => {
    const soundSystem = new ThreeJsSound(makeWorldRenderer() as any)
    soundSystem.baseVolume = 1
    soundSystem.playSound({ x: 0, y: 0, z: 0 }, '/test.mp3', 0.8)

    soundSystem.changeVolume(0.25)
    loadAsyncDeferreds[0].resolve({})
    await Promise.resolve()

    expect(mockSetVolume).toHaveBeenLastCalledWith(0.2)
  })
})
