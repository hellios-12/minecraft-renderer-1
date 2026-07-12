import { test, expect, beforeEach } from 'vitest'
import MinecraftData from 'minecraft-data'
import blocksAtlasesJson from 'mc-assets/dist/blocksAtlases.json'
import blockStatesModels from 'mc-assets/dist/blockStatesModels.json'
import Chunks from 'prismarine-chunk'
import { Vec3 } from 'vec3'
import { setBlockStatesData } from '../../mesher-shared/models'
import { getOccludingBlockMeta } from '../../mesher-shared/occludingBlocks'
import { VisGraph, packVisibilitySet } from '../../mesher-shared/visGraph'
import { Direction, unpackVisibilitySet } from '../../mesher-shared/visibilitySet'
import { World } from '../../mesher-shared/world'

const VERSION = '1.18.2'
const SECTION_HEIGHT = 16

beforeEach(() => {
  const mcData = MinecraftData(VERSION)
  setBlockStatesData(blockStatesModels, blocksAtlasesJson, false, true, VERSION, { blocks: mcData.blocksArray })
})

function buildVisibilityFromWorld(world: World, sx: number, sy: number, sz: number, sectionHeight: number): number {
  const { occludingLookup } = getOccludingBlockMeta(VERSION)
  const graph = new VisGraph()
  const cursor = new Vec3(0, 0, 0)
  for (cursor.y = sy; cursor.y < sy + sectionHeight; cursor.y++) {
    for (cursor.z = sz; cursor.z < sz + 16; cursor.z++) {
      for (cursor.x = sx; cursor.x < sx + 16; cursor.x++) {
        const block = world.getBlock(cursor)
        if (block && occludingLookup[block.stateId]) {
          graph.setOpaque(cursor.x - sx, cursor.y - sy, cursor.z - sz)
        }
      }
    }
  }
  return packVisibilitySet(graph.resolve())
}

function solidStoneSectionWorld(): World {
  const mcData = MinecraftData(VERSION)
  const stoneId = mcData.blocksByName.stone!.defaultState
  const Chunk = Chunks(VERSION) as any
  const chunk = new Chunk(undefined as any)
  for (let y = 0; y < SECTION_HEIGHT; y++) {
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        chunk.setBlockStateId(new Vec3(x, y, z), stoneId)
      }
    }
  }
  const world = new World(VERSION)
  world.addColumn(0, 0, chunk.toJson())
  return world
}

test('occludingLookup VisGraph: solid 16³ interior packs no face pairs (not all-open)', () => {
  const world = solidStoneSectionWorld()
  const bits = buildVisibilityFromWorld(world, 0, 0, 0, SECTION_HEIGHT)
  const vs = unpackVisibilitySet(bits)
  for (let a = 0; a < 6; a++) {
    for (let b = 0; b < 6; b++) {
      if (a === b) continue
      expect(vs.visibilityBetween(a, b)).toBe(false)
    }
  }
  expect(vs.visibilityBetween(Direction.NORTH, Direction.SOUTH)).toBe(false)
})

test('occludingLookup VisGraph: empty section is all-open', () => {
  const world = new World(VERSION)
  const Chunk = Chunks(VERSION) as any
  world.addColumn(0, 0, new Chunk(undefined as any).toJson())
  const bits = buildVisibilityFromWorld(world, 0, 0, 0, SECTION_HEIGHT)
  const vs = unpackVisibilitySet(bits)
  expect(vs.visibilityBetween(Direction.NORTH, Direction.SOUTH)).toBe(true)
})

test('occludingLookup VisGraph: tunnel N↔S only → only N/S connected', () => {
  const mcData = MinecraftData(VERSION)
  const stoneId = mcData.blocksByName.stone!.defaultState
  const Chunk = Chunks(VERSION) as any
  const chunk = new Chunk(undefined as any)
  for (let y = 0; y < SECTION_HEIGHT; y++) {
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        if (x === 0 || x === 15) {
          chunk.setBlockStateId(new Vec3(x, y, z), stoneId)
        }
      }
    }
  }
  const world = new World(VERSION)
  world.addColumn(0, 0, chunk.toJson())
  const bits = buildVisibilityFromWorld(world, 0, 0, 0, SECTION_HEIGHT)
  const vs = unpackVisibilitySet(bits)
  expect(vs.visibilityBetween(Direction.NORTH, Direction.SOUTH)).toBe(true)
  expect(vs.visibilityBetween(Direction.EAST, Direction.WEST)).toBe(false)
  expect(vs.visibilityBetween(Direction.NORTH, Direction.EAST)).toBe(false)
})

test('occludingLookup: stone is occluding, air is not', () => {
  const mcData = MinecraftData(VERSION)
  const { occludingLookup } = getOccludingBlockMeta(VERSION)
  const stoneId = mcData.blocksByName.stone!.defaultState
  const airId = mcData.blocksByName.air!.defaultState
  expect(occludingLookup[stoneId]).toBe(1)
  expect(occludingLookup[airId]).toBe(0)
})
