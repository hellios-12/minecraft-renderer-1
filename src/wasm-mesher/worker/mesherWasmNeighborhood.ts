export type ColumnChunkEntry = { x: number; z: number; chunk: any | null }

export interface PacketCacheSet {
  has: (key: string) => boolean
}

export interface PacketCaches {
  raw: PacketCacheSet
  v17: PacketCacheSet
  v16: PacketCacheSet
}

export function columnCacheKey(x: number, z: number) {
  return `${x},${z}`
}

export function columnHasPacketCache(x: number, z: number, caches: PacketCaches): boolean {
  const k = columnCacheKey(x, z)
  return caches.raw.has(k) || caches.v17.has(k) || caches.v16.has(k)
}

export function columnDataAvailable(x: number, z: number, getColumn: (x: number, z: number) => any | null | undefined, caches: PacketCaches): boolean {
  return !!getColumn(x, z) || columnHasPacketCache(x, z, caches)
}

export function countWorldColumns3x3(x: number, z: number, getColumn: (x: number, z: number) => any | null | undefined): number {
  let count = 0
  for (const dx of [-16, 0, 16]) {
    for (const dz of [-16, 0, 16]) {
      if (getColumn(x + dx, z + dz)) count++
    }
  }
  return count
}

export function countParsedCache3x3(x: number, z: number, caches: PacketCaches): number {
  let count = 0
  for (const dx of [-16, 0, 16]) {
    for (const dz of [-16, 0, 16]) {
      if (columnHasPacketCache(x + dx, z + dz, caches)) count++
    }
  }
  return count
}

export function collectChunksForColumnUnion(
  x: number,
  z: number,
  getColumn: (x: number, z: number) => any | null | undefined,
  caches: PacketCaches
): ColumnChunkEntry[] {
  const result: ColumnChunkEntry[] = []
  const seen = new Set<string>()

  const add = (nx: number, nz: number) => {
    const key = columnCacheKey(nx, nz)
    if (seen.has(key)) return
    seen.add(key)
    const chunk = getColumn(nx, nz) ?? null
    if (chunk || columnHasPacketCache(nx, nz, caches)) {
      result.push({ x: nx, z: nz, chunk })
    }
  }

  add(x, z)
  for (const dx of [-16, 0, 16]) {
    for (const dz of [-16, 0, 16]) {
      if (dx === 0 && dz === 0) continue
      add(x + dx, z + dz)
    }
  }
  return result
}

export const SIDE_NEIGHBOR_OFFSETS = [
  [-16, 0],
  [16, 0],
  [0, -16],
  [0, 16]
] as const

export class PendingNeighborHealTracker {
  // Neighbor column key -> columns that meshed without this neighbor.
  private awaiting = new Map<string, Set<string>>()

  private colKey(x: number, z: number) {
    return columnCacheKey(x, z)
  }

  recordMissingSide(columnX: number, columnZ: number, missingNeighborX: number, missingNeighborZ: number) {
    const neighborKey = this.colKey(missingNeighborX, missingNeighborZ)
    const columnKey = this.colKey(columnX, columnZ)
    let set = this.awaiting.get(neighborKey)
    if (!set) {
      set = new Set()
      this.awaiting.set(neighborKey, set)
    }
    set.add(columnKey)
  }

  takeColumnsAwaitingNeighbor(neighborX: number, neighborZ: number): Array<{ x: number; z: number }> {
    const key = this.colKey(neighborX, neighborZ)
    const waiting = this.awaiting.get(key)
    if (!waiting || waiting.size === 0) return []
    this.awaiting.delete(key)
    return [...waiting].map(k => {
      const [sx, sz] = k.split(',').map(Number)
      return { x: sx, z: sz }
    })
  }

  clearColumn(x: number, z: number) {
    const columnKey = this.colKey(x, z)
    for (const [neighborKey, set] of this.awaiting) {
      set.delete(columnKey)
      if (set.size === 0) this.awaiting.delete(neighborKey)
    }
    this.awaiting.delete(columnKey)
  }

  clear() {
    this.awaiting.clear()
  }
}
