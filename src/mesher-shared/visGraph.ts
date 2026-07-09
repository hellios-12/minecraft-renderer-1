/**
 * Port of Minecraft VisGraph — flood-fill air pockets in a 16³ section.
 * @see extracted_minecraft_data/client/net/minecraft/client/renderer/chunk/VisGraph.java
 */

import { Direction, DIRECTIONS, VisibilitySet, packVisibilitySet } from './visibilitySet'

const LEN = 16
const SIZE = 4096
const DX = 1
const DZ = 16
const DY = 256
const INVALID_INDEX = -1

function getIndex(x: number, y: number, z: number): number {
  return (x << 0) | (y << 8) | (z << 4)
}

const INDEX_OF_EDGES: number[] = (() => {
  const edges: number[] = []
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      for (let y = 0; y < 16; y++) {
        if (x === 0 || x === 15 || z === 0 || z === 15 || y === 0 || y === 15) {
          edges.push(getIndex(x, y, z))
        }
      }
    }
  }
  return edges
})()

class BitSet4096 {
  private readonly words = new Uint32Array(128)

  get(index: number): boolean {
    return ((this.words[index >> 5]! >> (index & 31)) & 1) === 1
  }

  set(index: number, value: boolean): void {
    if (value) {
      this.words[index >> 5]! |= 1 << (index & 31)
    } else {
      this.words[index >> 5]! &= ~(1 << (index & 31))
    }
  }
}

export class VisGraph {
  private readonly bitSet = new BitSet4096()
  private empty = SIZE

  setOpaque(x: number, y: number, z: number): void {
    const index = getIndex(x & 15, y & 15, z & 15)
    if (!this.bitSet.get(index)) {
      this.bitSet.set(index, true)
      this.empty--
    }
  }

  resolve(): VisibilitySet {
    const result = new VisibilitySet()
    if (SIZE - this.empty < 256) {
      result.setAll(true)
    } else if (this.empty === 0) {
      result.setAll(false)
    } else {
      for (const edgeIndex of INDEX_OF_EDGES) {
        if (!this.bitSet.get(edgeIndex)) {
          result.add(this.floodFill(edgeIndex))
        }
      }
    }
    return result
  }

  private floodFill(startIndex: number): Set<Direction> {
    const faces = new Set<Direction>()
    const queue: number[] = [startIndex]
    let head = 0
    this.bitSet.set(startIndex, true)

    while (head < queue.length) {
      const index = queue[head++]!
      this.addEdges(index, faces)

      for (const dir of DIRECTIONS) {
        const neighbor = this.getNeighborIndexAtFace(index, dir)
        if (neighbor >= 0 && !this.bitSet.get(neighbor)) {
          this.bitSet.set(neighbor, true)
          queue.push(neighbor)
        }
      }
    }

    return faces
  }

  private addEdges(index: number, faces: Set<Direction>): void {
    const x = (index >> 0) & 15
    if (x === 0) faces.add(Direction.WEST)
    else if (x === 15) faces.add(Direction.EAST)

    const y = (index >> 8) & 15
    if (y === 0) faces.add(Direction.DOWN)
    else if (y === 15) faces.add(Direction.UP)

    const z = (index >> 4) & 15
    if (z === 0) faces.add(Direction.NORTH)
    else if (z === 15) faces.add(Direction.SOUTH)
  }

  private getNeighborIndexAtFace(index: number, dir: Direction): number {
    switch (dir) {
      case Direction.DOWN:
        if (((index >> 8) & 15) === 0) return INVALID_INDEX
        return index - DY
      case Direction.UP:
        if (((index >> 8) & 15) === 15) return INVALID_INDEX
        return index + DY
      case Direction.NORTH:
        if (((index >> 4) & 15) === 0) return INVALID_INDEX
        return index - DZ
      case Direction.SOUTH:
        if (((index >> 4) & 15) === 15) return INVALID_INDEX
        return index + DZ
      case Direction.WEST:
        if (((index >> 0) & 15) === 0) return INVALID_INDEX
        return index - DX
      case Direction.EAST:
        if (((index >> 0) & 15) === 15) return INVALID_INDEX
        return index + DX
      default:
        return INVALID_INDEX
    }
  }
}

export function computeSectionVisibilitySet(sectionHeight: number, isOpaqueAt: (lx: number, ly: number, lz: number) => boolean): number {
  const graph = new VisGraph()
  const height = Math.min(sectionHeight, LEN)
  for (let ly = 0; ly < height; ly++) {
    for (let lz = 0; lz < LEN; lz++) {
      for (let lx = 0; lx < LEN; lx++) {
        if (isOpaqueAt(lx, ly, lz)) {
          graph.setOpaque(lx, ly, lz)
        }
      }
    }
  }
  return packVisibilitySet(graph.resolve())
}

export { packVisibilitySet } from './visibilitySet'
