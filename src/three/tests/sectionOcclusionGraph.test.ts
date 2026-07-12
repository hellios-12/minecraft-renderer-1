import { test, expect } from 'vitest'
import { Direction } from '../../mesher-shared/visibilitySet'
import { SectionOcclusionGraph } from '../occlusion/sectionOcclusionGraph'
import { computeSectionVisibilitySet } from '../../mesher-shared/visGraph'

const ALL_OPEN = computeSectionVisibilitySet(16, () => false)
const SOLID = computeSectionVisibilitySet(16, () => true)

function reg(graph: SectionOcclusionGraph, key: string, vis = ALL_OPEN) {
  const [x, y, z] = key.split(',').map(Number)
  graph.registerSection(key, { visibilitySet: vis, worldX: x!, worldY: y!, worldZ: z! })
}

test('BFS from camera section reaches neighbors when smart cull on and faces connect', () => {
  const graph = new SectionOcclusionGraph()
  reg(graph, '0,0,0')
  reg(graph, '16,0,0')
  reg(graph, '-16,0,0')

  const visible = graph.update({
    smartCull: true,
    cameraWorldX: 8,
    cameraWorldY: 8,
    cameraWorldZ: 8,
    viewDistance: 4,
    sectionHeight: 16,
    worldMinY: 0,
    worldMaxY: 256
  })

  expect(visible.has('0,0,0')).toBe(true)
  expect(visible.has('16,0,0')).toBe(true)
  expect(visible.has('-16,0,0')).toBe(true)
})

test('solid section blocks traversal to neighbor behind it', () => {
  const graph = new SectionOcclusionGraph()
  reg(graph, '0,0,0', ALL_OPEN)
  reg(graph, '16,0,0', SOLID)
  reg(graph, '32,0,0', ALL_OPEN)

  const visible = graph.update({
    smartCull: true,
    cameraWorldX: 8,
    cameraWorldY: 8,
    cameraWorldZ: 8,
    viewDistance: 4,
    sectionHeight: 16,
    worldMinY: 0,
    worldMaxY: 256
  })

  expect(visible.has('0,0,0')).toBe(true)
  expect(visible.has('16,0,0')).toBe(true)
  expect(visible.has('32,0,0')).toBe(false)
})

test('smart cull off shows all registered sections', () => {
  const graph = new SectionOcclusionGraph()
  reg(graph, '0,0,0')
  reg(graph, '64,0,0', SOLID)

  const visible = graph.update({
    smartCull: false,
    cameraWorldX: 8,
    cameraWorldY: 8,
    cameraWorldZ: 8,
    viewDistance: 2,
    sectionHeight: 16,
    worldMinY: 0,
    worldMaxY: 256
  })

  expect(visible.has('64,0,0')).toBe(true)
})

test('BFS assigns increasing step values', () => {
  const graph = new SectionOcclusionGraph()
  reg(graph, '0,0,0')
  reg(graph, '16,0,0')

  graph.update({
    smartCull: true,
    cameraWorldX: 8,
    cameraWorldY: 8,
    cameraWorldZ: 8,
    viewDistance: 4,
    sectionHeight: 16,
    worldMinY: 0,
    worldMaxY: 256
  })

  expect(graph.getStep('0,0,0')).toBe(0)
  expect(graph.getStep('16,0,0')).toBe(1)
})

test('N-S tunnel section only connects through north/south faces', () => {
  const tunnelVis = computeSectionVisibilitySet(16, (lx, _ly, _lz) => lx === 0 || lx === 15)
  const graph = new SectionOcclusionGraph()
  reg(graph, '0,0,0', tunnelVis)
  reg(graph, '0,0,16', ALL_OPEN)

  const visible = graph.update({
    smartCull: true,
    cameraWorldX: 8,
    cameraWorldY: 8,
    cameraWorldZ: 8,
    viewDistance: 4,
    sectionHeight: 16,
    worldMinY: 0,
    worldMaxY: 256
  })

  expect(visible.has('0,0,16')).toBe(true)
})

test('missing camera section seeds from surface ring', () => {
  const graph = new SectionOcclusionGraph()
  reg(graph, '0,0,0')

  const visible = graph.update({
    smartCull: true,
    cameraWorldX: 8,
    cameraWorldY: -32,
    cameraWorldZ: 8,
    viewDistance: 4,
    sectionHeight: 16,
    worldMinY: 0,
    worldMaxY: 256
  })

  expect(visible.has('0,0,0')).toBe(true)
})
