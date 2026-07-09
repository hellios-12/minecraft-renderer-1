/**
 * Port of Minecraft VisibilitySet — 6×6 face connectivity matrix for section air pockets.
 * @see extracted_minecraft_data/client/net/minecraft/client/renderer/chunk/VisibilitySet.java
 */

/** Java Direction.values() order: DOWN, UP, NORTH, SOUTH, WEST, EAST */
export enum Direction {
  DOWN = 0,
  UP = 1,
  NORTH = 2,
  SOUTH = 3,
  WEST = 4,
  EAST = 5
}

export const DIRECTIONS: readonly Direction[] = [Direction.DOWN, Direction.UP, Direction.NORTH, Direction.SOUTH, Direction.WEST, Direction.EAST]

const FACINGS = DIRECTIONS.length

/** All 36 bits set — fail-open default when visibility data is missing. */
export const VISIBILITY_SET_ALL_TRUE = 2 ** 36 - 1

export class VisibilitySet {
  private data = new Uint8Array(Math.ceil((FACINGS * FACINGS) / 8))

  add(faces: Set<Direction>): void {
    for (const a of faces) {
      for (const b of faces) {
        this.set(a, b, true)
      }
    }
  }

  set(a: Direction, b: Direction, value: boolean): void {
    this.setBit(a + b * FACINGS, value)
    this.setBit(b + a * FACINGS, value)
  }

  setAll(value: boolean): void {
    this.data.fill(value ? 0xff : 0)
  }

  visibilityBetween(a: Direction, b: Direction): boolean {
    return this.getBit(a + b * FACINGS)
  }

  static allTrue(): VisibilitySet {
    const vs = new VisibilitySet()
    vs.setAll(true)
    return vs
  }

  static allFalse(): VisibilitySet {
    const vs = new VisibilitySet()
    vs.setAll(false)
    return vs
  }

  private setBit(index: number, value: boolean): void {
    const byteIndex = index >> 3
    const bitIndex = index & 7
    if (value) {
      this.data[byteIndex]! |= 1 << bitIndex
    } else {
      this.data[byteIndex]! &= ~(1 << bitIndex)
    }
  }

  private getBit(index: number): boolean {
    const byteIndex = index >> 3
    const bitIndex = index & 7
    return ((this.data[byteIndex]! >> bitIndex) & 1) === 1
  }
}

export function packVisibilitySet(vs: VisibilitySet): number {
  let bits = 0
  for (let a = 0; a < FACINGS; a++) {
    for (let b = 0; b < FACINGS; b++) {
      if (vs.visibilityBetween(a, b)) {
        bits += 2 ** (a + b * FACINGS)
      }
    }
  }
  return bits
}

export function unpackVisibilitySet(bits: number): VisibilitySet {
  const vs = new VisibilitySet()
  for (let a = 0; a < FACINGS; a++) {
    for (let b = 0; b < FACINGS; b++) {
      const idx = a + b * FACINGS
      if (Math.floor(bits / 2 ** idx) % 2 === 1) {
        vs.set(a, b, true)
      }
    }
  }
  return vs
}

export function visibilityBetweenPacked(bits: number, a: Direction, b: Direction): boolean {
  const idx = a + b * FACINGS
  return Math.floor(bits / 2 ** idx) % 2 === 1
}

export function oppositeDirection(dir: Direction): Direction {
  switch (dir) {
    case Direction.DOWN:
      return Direction.UP
    case Direction.UP:
      return Direction.DOWN
    case Direction.NORTH:
      return Direction.SOUTH
    case Direction.SOUTH:
      return Direction.NORTH
    case Direction.WEST:
      return Direction.EAST
    case Direction.EAST:
      return Direction.WEST
    default:
      return dir
  }
}
