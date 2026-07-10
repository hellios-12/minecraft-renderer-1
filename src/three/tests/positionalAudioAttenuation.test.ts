import { describe, expect, it } from 'vitest'
import { computeEffectiveVolume, computeIndividualGain, computePositionalAudioParams, DEFAULT_ATTENUATION_DISTANCE } from '../positionalAudioAttenuation'

describe('computeEffectiveVolume', () => {
  it('multiplies entry volume by non-negative packet volume', () => {
    expect(computeEffectiveVolume(1, 1)).toBe(1)
    expect(computeEffectiveVolume(12, 2)).toBe(24)
    expect(computeEffectiveVolume(1, 0.5)).toBe(0.5)
  })

  it('does not clamp packet volume above 1', () => {
    expect(computeEffectiveVolume(1, 2)).toBe(2)
    expect(computeEffectiveVolume(12, 2)).toBe(24)
  })

  it('treats negative packet volume as zero', () => {
    expect(computeEffectiveVolume(1, -1)).toBe(0)
  })
})

describe('computePositionalAudioParams', () => {
  it('uses default attenuation distance semantics', () => {
    expect(computePositionalAudioParams(1, DEFAULT_ATTENUATION_DISTANCE)).toEqual({
      individualGain: 1,
      maxDistance: 16
    })
  })

  it('clamps individual gain to [0, 1] while extending range for volume > 1', () => {
    expect(computePositionalAudioParams(24, 16)).toEqual({
      individualGain: 1,
      maxDistance: 384
    })
  })

  it('keeps individual gain independent of master volume', () => {
    expect(computeIndividualGain(1)).toBe(1)
    expect(computeIndividualGain(2)).toBe(1)
    expect(computeIndividualGain(0.5)).toBe(0.5)
  })

  it('matches vanilla linear falloff checkpoints at distance 0/8/16', () => {
    const { individualGain, maxDistance } = computePositionalAudioParams(1, 16)
    const linearMultiplier = (distance: number) => 1 - distance / maxDistance
    expect(individualGain * linearMultiplier(0)).toBe(1)
    expect(individualGain * linearMultiplier(8)).toBe(0.5)
    expect(individualGain * linearMultiplier(16)).toBe(0)
    expect(individualGain * linearMultiplier(24)).toBeLessThanOrEqual(0)
  })
})
