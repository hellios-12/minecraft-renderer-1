export const DEFAULT_ATTENUATION_DISTANCE = 16

export function computeEffectiveVolume(soundEntryVolume: number, packetVolume: number): number {
  return soundEntryVolume * Math.max(packetVolume, 0)
}

export function computeIndividualGain(effectiveVolume: number): number {
  return Math.min(Math.max(effectiveVolume, 0), 1)
}

export function computePositionalAudioParams(effectiveVolume: number, attenuationDistance: number): { individualGain: number; maxDistance: number } {
  return {
    individualGain: computeIndividualGain(effectiveVolume),
    maxDistance: Math.max(effectiveVolume, 1) * attenuationDistance
  }
}

export function applyVanillaLinearPanner(panner: PannerNode, maxDistance: number): void {
  panner.distanceModel = 'linear'
  panner.refDistance = 0
  panner.rolloffFactor = 1
  panner.maxDistance = maxDistance
}

export function setPannerPositionImmediate(panner: PannerNode, audioContext: AudioContext, x: number, y: number, z: number): void {
  const t = audioContext.currentTime
  if (panner.positionX) {
    panner.positionX.setValueAtTime(x, t)
    panner.positionY.setValueAtTime(y, t)
    panner.positionZ.setValueAtTime(z, t)
  } else {
    panner.setPosition(x, y, z)
  }
}
