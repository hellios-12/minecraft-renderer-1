/**
 * Sync port of Minecraft SectionOcclusionGraph BFS (v1 — no Octree/async/advanced ray-march).
 * @see extracted_minecraft_data/client/net/minecraft/client/renderer/SectionOcclusionGraph.java
 */

import { Vec3 } from 'vec3'
import { Direction, DIRECTIONS, VISIBILITY_SET_ALL_TRUE, oppositeDirection, visibilityBetweenPacked } from '../../mesher-shared/visibilitySet'

export type OcclusionSectionRecord = {
  visibilitySet: number
  worldX: number
  worldY: number
  worldZ: number
}

export type OcclusionUpdateParams = {
  smartCull: boolean
  cameraWorldX: number
  cameraWorldY: number
  cameraWorldZ: number
  viewDistance: number
  sectionHeight: number
  worldMinY: number
  worldMaxY: number
}

export class OcclusionNode {
  readonly sectionKey: string
  private sourceDirections = 0
  directions = 0
  readonly step: number

  constructor(sectionKey: string, sourceDir: Direction | null, step: number) {
    this.sectionKey = sectionKey
    this.step = step
    if (sourceDir != null) {
      this.addSourceDirection(sourceDir)
    }
  }

  setDirections(fromParent: number, exitDir: Direction): void {
    this.directions = (fromParent | this.directions | (1 << exitDir)) >>> 0
  }

  hasDirection(dir: Direction): boolean {
    return (this.directions & (1 << dir)) !== 0
  }

  addSourceDirection(dir: Direction): void {
    this.sourceDirections = (this.sourceDirections | (1 << dir)) >>> 0
  }

  hasSourceDirection(index: number): boolean {
    return (this.sourceDirections & (1 << index)) !== 0
  }

  hasSourceDirections(): boolean {
    return this.sourceDirections !== 0
  }
}

function sectionKeyFromWorld(worldX: number, worldY: number, worldZ: number): string {
  return `${worldX},${worldY},${worldZ}`
}

function parseSectionKey(key: string): { x: number; y: number; z: number } {
  const [x, y, z] = key.split(',').map(Number)
  return { x: x!, y: y!, z: z! }
}

function getNeighborKey(key: string, dir: Direction, sectionHeight: number): string {
  const { x, y, z } = parseSectionKey(key)
  switch (dir) {
    case Direction.DOWN:
      return sectionKeyFromWorld(x, y - sectionHeight, z)
    case Direction.UP:
      return sectionKeyFromWorld(x, y + sectionHeight, z)
    case Direction.NORTH:
      return sectionKeyFromWorld(x, y, z - 16)
    case Direction.SOUTH:
      return sectionKeyFromWorld(x, y, z + 16)
    case Direction.WEST:
      return sectionKeyFromWorld(x - 16, y, z)
    case Direction.EAST:
      return sectionKeyFromWorld(x + 16, y, z)
    default:
      return key
  }
}

function isInViewDistance(cameraKey: string, sectionKey: string, viewDistance: number, sectionHeight: number): boolean {
  const cam = parseSectionKey(cameraKey)
  const sec = parseSectionKey(sectionKey)
  const camChunkX = Math.floor(cam.x / 16)
  const camChunkZ = Math.floor(cam.z / 16)
  const secChunkX = Math.floor(sec.x / 16)
  const secChunkZ = Math.floor(sec.z / 16)
  if (Math.abs(secChunkX - camChunkX) > viewDistance || Math.abs(secChunkZ - camChunkZ) > viewDistance) {
    return false
  }
  const camSecY = Math.floor(cam.y / sectionHeight)
  const secSecY = Math.floor(sec.y / sectionHeight)
  return Math.abs(secSecY - camSecY) <= viewDistance
}

export class SectionOcclusionGraph {
  private readonly sections = new Map<string, OcclusionSectionRecord>()
  private readonly nodeByKey = new Map<string, OcclusionNode>()
  private visibleKeys = new Set<string>()
  private stepByKey = new Map<string, number>()
  private needsFullUpdate = true
  private lastCameraKey = ''

  registerSection(key: string, record: OcclusionSectionRecord): void {
    // v1: every register/unregister triggers a synchronous full BFS on next update (no partial graph).
    this.sections.set(key, record)
    this.needsFullUpdate = true
  }

  unregisterSection(key: string): void {
    if (this.sections.delete(key)) {
      this.needsFullUpdate = true
    }
    this.nodeByKey.delete(key)
    this.visibleKeys.delete(key)
    this.stepByKey.delete(key)
  }

  invalidate(): void {
    this.needsFullUpdate = true
  }

  getVisibleKeys(): ReadonlySet<string> {
    return this.visibleKeys
  }

  getStep(key: string): number | undefined {
    return this.stepByKey.get(key)
  }

  isVisible(key: string): boolean {
    return this.visibleKeys.has(key)
  }

  update(params: OcclusionUpdateParams): Set<string> {
    const cameraKey = sectionKeyFromWorld(
      Math.floor(params.cameraWorldX / 16) * 16,
      Math.floor(params.cameraWorldY / params.sectionHeight) * params.sectionHeight,
      Math.floor(params.cameraWorldZ / 16) * 16
    )

    if (cameraKey !== this.lastCameraKey) {
      this.needsFullUpdate = true
      this.lastCameraKey = cameraKey
    }

    if (!params.smartCull) {
      this.visibleKeys = new Set(this.sections.keys())
      this.stepByKey.clear()
      for (const key of this.visibleKeys) {
        this.stepByKey.set(key, 0)
      }
      return this.visibleKeys
    }

    if (this.needsFullUpdate) {
      this.runFullUpdate(cameraKey, params)
      this.needsFullUpdate = false
    }

    return this.visibleKeys
  }

  private runFullUpdate(cameraKey: string, params: OcclusionUpdateParams): void {
    this.nodeByKey.clear()
    this.visibleKeys = new Set()
    this.stepByKey.clear()

    const queue: OcclusionNode[] = []
    this.initializeQueueForFullUpdate(cameraKey, queue, params)

    while (queue.length > 0) {
      const node = queue.shift()!
      const sectionKey = node.sectionKey
      if (!this.sections.has(sectionKey)) continue

      this.visibleKeys.add(sectionKey)
      this.stepByKey.set(sectionKey, node.step)

      const visibilitySet = this.sections.get(sectionKey)?.visibilitySet ?? VISIBILITY_SET_ALL_TRUE

      for (const exitDir of DIRECTIONS) {
        const neighborSectionKey = getNeighborKey(sectionKey, exitDir, params.sectionHeight)
        if (!this.sections.has(neighborSectionKey)) continue
        if (!isInViewDistance(cameraKey, neighborSectionKey, params.viewDistance, params.sectionHeight)) continue

        if (node.hasDirection(oppositeDirection(exitDir))) continue

        if (node.hasSourceDirections()) {
          let canSee = false
          for (let i = 0; i < DIRECTIONS.length; i++) {
            if (node.hasSourceDirection(i) && visibilityBetweenPacked(visibilitySet, oppositeDirection(DIRECTIONS[i]!), exitDir)) {
              canSee = true
              break
            }
          }
          if (!canSee) continue
        }

        const existing = this.nodeByKey.get(neighborSectionKey)
        if (existing) {
          existing.addSourceDirection(exitDir)
        } else {
          const next = new OcclusionNode(neighborSectionKey, exitDir, node.step + 1)
          next.setDirections(node.directions, exitDir)
          this.nodeByKey.set(neighborSectionKey, next)
          queue.push(next)
        }
      }
    }
  }

  /** @see SectionOcclusionGraph.initializeQueueForFullUpdate */
  private initializeQueueForFullUpdate(cameraKey: string, queue: OcclusionNode[], params: OcclusionUpdateParams): void {
    if (this.sections.has(cameraKey)) {
      const node = new OcclusionNode(cameraKey, null, 0)
      this.nodeByKey.set(cameraKey, node)
      queue.push(node)
      return
    }

    const cam = parseSectionKey(cameraKey)
    const camSecY = Math.floor(cam.y / params.sectionHeight)
    const minSecY = Math.floor(params.worldMinY / params.sectionHeight)
    const maxSecY = Math.floor((params.worldMaxY - 1) / params.sectionHeight)
    const belowMin = camSecY < minSecY
    const surfaceSecY = belowMin ? minSecY : maxSecY
    const surfaceY = surfaceSecY * params.sectionHeight

    const camChunkX = Math.floor(cam.x / 16)
    const camChunkZ = Math.floor(cam.z / 16)
    const seeds: Array<{ node: OcclusionNode; distSq: number }> = []

    for (let dx = -params.viewDistance; dx <= params.viewDistance; dx++) {
      for (let dz = -params.viewDistance; dz <= params.viewDistance; dz++) {
        const key = sectionKeyFromWorld((camChunkX + dx) * 16, surfaceY, (camChunkZ + dz) * 16)
        if (!this.sections.has(key)) continue
        if (!isInViewDistance(cameraKey, key, params.viewDistance, params.sectionHeight)) continue

        const entryDir = belowMin ? Direction.UP : Direction.DOWN
        const node = new OcclusionNode(key, entryDir, 0)
        node.setDirections(0, entryDir)
        if (dx > 0) node.setDirections(node.directions, Direction.EAST)
        else if (dx < 0) node.setDirections(node.directions, Direction.WEST)
        if (dz > 0) node.setDirections(node.directions, Direction.SOUTH)
        else if (dz < 0) node.setDirections(node.directions, Direction.NORTH)

        const center = new Vec3(cam.x + 8, cam.y + 8, cam.z + 8)
        const sec = parseSectionKey(key)
        const distSq = center.distanceTo(new Vec3(sec.x + 8, sec.y + 8, sec.z + 8))
        seeds.push({ node, distSq })
      }
    }

    seeds.sort((a, b) => a.distSq - b.distSq)
    for (const seed of seeds) {
      this.nodeByKey.set(seed.node.sectionKey, seed.node)
      queue.push(seed.node)
    }
  }
}
