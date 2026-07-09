import { test, expect } from 'vitest'
import { SectionOcclusionCull } from '../occlusion/sectionOcclusionCull'
import { computeSectionVisibilitySet } from '../../mesher-shared/visGraph'

const ALL_OPEN = computeSectionVisibilitySet(16, () => false)

test('isSectionVisible fails open for unregistered sections', () => {
  const cull = new SectionOcclusionCull()
  cull.registerSection('0,0,0', ALL_OPEN, 8, 8, 8)
  cull.update({
    smartCull: true,
    cameraWorldX: 8,
    cameraWorldY: 8,
    cameraWorldZ: 8,
    viewDistance: 4,
    sectionHeight: 16,
    worldMinY: 0,
    worldMaxY: 256
  })
  expect(cull.isSectionVisible('64,0,64')).toBe(true)
})

test('notifySmartCullChanged invalidates graph', () => {
  const cull = new SectionOcclusionCull()
  cull.registerSection('0,0,0', ALL_OPEN, 8, 8, 8)
  cull.update({
    smartCull: false,
    cameraWorldX: 8,
    cameraWorldY: 8,
    cameraWorldZ: 8,
    viewDistance: 4,
    sectionHeight: 16,
    worldMinY: 0,
    worldMaxY: 256
  })
  const offVisible = cull.getVisibleKeys()
  expect(offVisible.has('0,0,0')).toBe(true)
  cull.invalidate()
  cull.update({
    smartCull: true,
    cameraWorldX: 8,
    cameraWorldY: 8,
    cameraWorldZ: 8,
    viewDistance: 4,
    sectionHeight: 16,
    worldMinY: 0,
    worldMaxY: 256
  })
  expect(cull.isSectionVisible('0,0,0')).toBe(true)
})
