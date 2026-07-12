import { test, expect } from 'vitest'
import { Direction, VisibilitySet, packVisibilitySet, unpackVisibilitySet, visibilityBetweenPacked } from '../visibilitySet'
import { VisGraph, computeSectionVisibilitySet } from '../visGraph'

test('empty section → all face pairs visible', () => {
  const bits = computeSectionVisibilitySet(16, () => false)
  const vs = unpackVisibilitySet(bits)
  for (let a = 0; a < 6; a++) {
    for (let b = 0; b < 6; b++) {
      if (a === b) continue
      expect(vs.visibilityBetween(a, b)).toBe(true)
    }
  }
})

test('solid stone cube → no face pairs', () => {
  const bits = computeSectionVisibilitySet(16, () => true)
  const vs = unpackVisibilitySet(bits)
  for (let a = 0; a < 6; a++) {
    for (let b = 0; b < 6; b++) {
      if (a === b) continue
      expect(vs.visibilityBetween(a, b)).toBe(false)
    }
  }
})

test('tunnel through section N↔S only → only N/S connected', () => {
  const bits = computeSectionVisibilitySet(16, (lx, _ly, lz) => {
    // walls on east/west, open north-south corridor along z
    return lx === 0 || lx === 15
  })
  const vs = unpackVisibilitySet(bits)
  expect(vs.visibilityBetween(Direction.NORTH, Direction.SOUTH)).toBe(true)
  expect(vs.visibilityBetween(Direction.EAST, Direction.WEST)).toBe(false)
  expect(vs.visibilityBetween(Direction.NORTH, Direction.EAST)).toBe(false)
})

test('VisibilitySet pack/unpack roundtrip', () => {
  const vs = new VisibilitySet()
  vs.add(new Set([Direction.NORTH, Direction.SOUTH]))
  const packed = packVisibilitySet(vs)
  const restored = unpackVisibilitySet(packed)
  expect(restored.visibilityBetween(Direction.NORTH, Direction.SOUTH)).toBe(true)
  expect(restored.visibilityBetween(Direction.EAST, Direction.WEST)).toBe(false)
  expect(visibilityBetweenPacked(packed, Direction.NORTH, Direction.SOUTH)).toBe(true)
})

test('VisGraph fast path: mostly opaque → all visible', () => {
  const graph = new VisGraph()
  let count = 0
  for (let ly = 0; ly < 16 && count < 3841; ly++) {
    for (let lz = 0; lz < 16 && count < 3841; lz++) {
      for (let lx = 0; lx < 16 && count < 3841; lx++) {
        graph.setOpaque(lx, ly, lz)
        count++
      }
    }
  }
  const vs = graph.resolve()
  expect(vs.visibilityBetween(Direction.NORTH, Direction.SOUTH)).toBe(true)
})
