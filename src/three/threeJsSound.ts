import * as THREE from 'three'
import { WorldRendererThree } from './worldRendererThree'
import { SoundSystem } from '../graphicsBackend/types'
import { applyVanillaLinearPanner, computePositionalAudioParams, DEFAULT_ATTENUATION_DISTANCE, setPannerPositionImmediate } from './positionalAudioAttenuation'

const _pannerPosition = /*@__PURE__*/ new THREE.Vector3()
const _pannerQuaternion = /*@__PURE__*/ new THREE.Quaternion()
const _pannerScale = /*@__PURE__*/ new THREE.Vector3()

export class ThreeJsSound implements SoundSystem {
  audioListener: THREE.AudioListener | undefined
  private readonly activeSounds = new Set<THREE.PositionalAudio>()
  private readonly audioContext: AudioContext | undefined
  /** Normalized individual gain (clamped to [0, 1], excluding master volume). */
  private readonly soundVolumes = new Map<THREE.PositionalAudio, number>()
  baseVolume = 1

  constructor(public worldRenderer: WorldRendererThree) {
    worldRenderer.onWorldSwitched.push(() => {
      this.stopAll()
    })

    worldRenderer.onReactiveConfigUpdated('volume', volume => {
      this.changeVolume(volume)
    })
  }

  initAudioListener() {
    if (this.audioListener) return
    this.audioListener = new THREE.AudioListener()
    this.worldRenderer.camera.add(this.audioListener)
  }

  playSound(
    position: { x: number; y: number; z: number },
    path: string,
    volume = 1,
    pitch = 1,
    timeout = 500,
    attenuationDistance = DEFAULT_ATTENUATION_DISTANCE
  ) {
    this.initAudioListener()

    const sound = new THREE.PositionalAudio(this.audioListener!)
    this.activeSounds.add(sound)

    const { individualGain, maxDistance } = computePositionalAudioParams(volume, attenuationDistance)
    this.soundVolumes.set(sound, individualGain)

    const audioLoader = new THREE.AudioLoader()
    const start = Date.now()
    void audioLoader.loadAsync(path).then(buffer => {
      if (Date.now() - start > timeout) {
        console.warn('Ignored playing sound', path, 'due to timeout:', timeout, 'ms <', Date.now() - start, 'ms')
        this.activeSounds.delete(sound)
        this.soundVolumes.delete(sound)
        return
      }
      sound.setBuffer(buffer)
      applyVanillaLinearPanner(sound.panner, maxDistance)
      sound.setVolume(individualGain * this.baseVolume)
      sound.setPlaybackRate(pitch)
      this.worldRenderer.sceneOrigin.addAndTrack(sound)
      sound.position.set(position.x, position.y, position.z)
      sound.updateMatrixWorld(true)
      sound.matrixWorld.decompose(_pannerPosition, _pannerQuaternion, _pannerScale)
      setPannerPositionImmediate(sound.panner, this.audioListener!.context, _pannerPosition.x, _pannerPosition.y, _pannerPosition.z)
      sound.onEnded = () => {
        this.worldRenderer.sceneOrigin.removeAndUntrack(sound)
        if (sound.source) {
          sound.disconnect()
        }
        this.activeSounds.delete(sound)
        this.soundVolumes.delete(sound)
        audioLoader.manager.itemEnd(path)
      }
      sound.play()
    })
  }

  stopAll() {
    for (const sound of this.activeSounds) {
      if (!sound) continue
      sound.stop()
      if (sound.source) {
        sound.disconnect()
      }
      this.worldRenderer.sceneOrigin.removeAndUntrack(sound)
    }
    this.activeSounds.clear()
    this.soundVolumes.clear()
  }

  changeVolume(volume: number) {
    this.baseVolume = volume
    for (const [sound, individualGain] of this.soundVolumes) {
      sound.setVolume(individualGain * this.baseVolume)
    }
  }

  destroy() {
    this.stopAll()
    if (this.audioListener) {
      this.audioListener.removeFromParent()
      this.audioListener = undefined
    }
  }

  playTestSound() {
    const { x, y, z } = this.worldRenderer.cameraWorldPos
    this.playSound({ x, y, z }, '/sound.mp3')
  }
}
