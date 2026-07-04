import { describe, expect, test } from 'vitest'
import {
  PendingNeighborHealTracker,
  collectChunksForColumnUnion,
  columnDataAvailable,
  countParsedCache3x3,
  countWorldColumns3x3
} from '../worker/mesherWasmNeighborhood'

describe('collectChunksForColumnUnion', () => {
  test('includes cache-only side neighbors not yet in world.columns', () => {
    const worldCols = new Map<string, any>([['0,0', { id: 'A' }]])
    const packet = new Set(['16,0'])

    const result = collectChunksForColumnUnion(0, 0, (x, z) => worldCols.get(`${x},${z}`) ?? null, { raw: packet, v17: new Set(), v16: new Set() })

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ x: 0, z: 0, chunk: { id: 'A' } })
    expect(result[1]).toEqual({ x: 16, z: 0, chunk: null })
  })

  test('returns full 3x3 when both pipelines are complete', () => {
    const worldCols = new Map<string, any>()
    const packet = new Set<string>()
    for (const dx of [-16, 0, 16]) {
      for (const dz of [-16, 0, 16]) {
        worldCols.set(`${dx},${dz}`, {})
        packet.add(`${dx},${dz}`)
      }
    }

    const result = collectChunksForColumnUnion(0, 0, (x, z) => worldCols.get(`${x},${z}`) ?? null, {
      raw: packet,
      v17: new Set(),
      v16: new Set()
    })

    expect(result).toHaveLength(9)
  })
})

describe('column availability counters', () => {
  test('detects pipeline A lag behind packet caches', () => {
    const worldCols = new Map<string, any>([
      ['0,0', {}],
      ['16,0', {}],
      ['-16,0', {}],
      ['0,16', {}]
    ])
    const packet = new Set(['0,0', '16,0', '-16,0', '0,16', '0,-16', '16,16', '-16,16', '-16,-16', '16,-16'])
    const caches = { raw: packet, v17: new Set(), v16: new Set() }

    expect(countWorldColumns3x3(0, 0, (x, z) => worldCols.get(`${x},${z}`) ?? null)).toBe(4)
    expect(countParsedCache3x3(0, 0, caches)).toBe(9)
    expect(columnDataAvailable(0, -16, (x, z) => worldCols.get(`${x},${z}`) ?? null, caches)).toBe(true)
    expect(columnDataAvailable(16, 16, (x, z) => worldCols.get(`${x},${z}`) ?? null, caches)).toBe(true)
  })
})

describe('PendingNeighborHealTracker', () => {
  test('queues and releases columns awaiting a missing neighbor', () => {
    const tracker = new PendingNeighborHealTracker()
    tracker.recordMissingSide(0, 0, 16, 0)
    tracker.recordMissingSide(0, 16, 16, 0)

    expect(tracker.takeColumnsAwaitingNeighbor(16, 0).sort((a, b) => a.z - b.z)).toEqual([
      { x: 0, z: 0 },
      { x: 0, z: 16 }
    ])
    expect(tracker.takeColumnsAwaitingNeighbor(16, 0)).toEqual([])
  })

  test('clears column references on unload', () => {
    const tracker = new PendingNeighborHealTracker()
    tracker.recordMissingSide(0, 0, 16, 0)
    tracker.clearColumn(0, 0)
    expect(tracker.takeColumnsAwaitingNeighbor(16, 0)).toEqual([])
  })

  test('union grows when packet cache arrives for a missing side neighbor (I1 heal)', () => {
    const worldCols = new Map<string, any>([['0,0', {}]])
    const v17 = new Set<string>()
    const caches = { raw: new Set<string>(), v17, v16: new Set<string>() }
    const getColumn = (x: number, z: number) => worldCols.get(`${x},${z}`) ?? null

    expect(collectChunksForColumnUnion(0, 0, getColumn, caches)).toHaveLength(1)
    v17.add('16,0')
    expect(collectChunksForColumnUnion(0, 0, getColumn, caches)).toHaveLength(2)
  })
})
