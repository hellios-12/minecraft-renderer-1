import { beforeAll, beforeEach, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import Chunks from 'prismarine-chunk'
import MinecraftData from 'minecraft-data'
import { Vec3 } from 'vec3'
import PrismarineBlockLoader from 'prismarine-block'
import blocksAtlasesJson from 'mc-assets/dist/blocksAtlases.json'
import blockStatesModels from 'mc-assets/dist/blockStatesModels.json'
import { setBlockStatesData } from '../../mesher-shared/models'
import { resetFaceOcclusionCache } from '../../mesher-shared/faceOcclusion'
import { convertChunkToWasm, getBlockMeta } from '../bridge/convertChunk'
import type { WasmGeometryOutput } from '../bridge/render-from-wasm'

const VERSION = '1.17.1'
const ICE_Y = 62
const WATER_Y = 61
const WORLD_MIN_Y = 0
const WORLD_MAX_Y = 256
const COLUMN_HEIGHT = WORLD_MAX_Y - WORLD_MIN_Y

const EAST_FACE = 1 << 2
const WEST_FACE = 1 << 3

let wasmModule: typeof import('../runtime-build/wasm_mesher.js')

beforeAll(async () => {
  wasmModule = await import('../runtime-build/wasm_mesher.js')
  const wasmDir = dirname(fileURLToPath(import.meta.url))
  const wasmBytes = readFileSync(join(wasmDir, '../runtime-build/wasm_mesher_bg.wasm'))
  wasmModule.initSync(wasmBytes)
})

beforeEach(() => {
  resetFaceOcclusionCache()
  const mcData = MinecraftData(VERSION)
  setBlockStatesData(blockStatesModels, blocksAtlasesJson, false, true, VERSION, { blocks: mcData.blocksArray })
  ;(globalThis as any).__wasmBlockModelCache = new Map()
})

function resolveStateId(name: string) {
  const mcData = MinecraftData(VERSION)
  const block = mcData.blocksByName[name]
  if (!block) throw new Error(`Unknown block: ${name}`)
  return block.defaultState
}

function buildIceOverWaterColumn() {
  const Chunk = Chunks(VERSION) as any
  const chunk = new Chunk(undefined as any)
  const iceId = resolveStateId('ice')
  const waterId = resolveStateId('water')

  for (let z = 0; z < 16; z++) {
    for (let x = 0; x < 16; x++) {
      chunk.setBlockStateId(new Vec3(x, WATER_Y, z), waterId)
      chunk.setBlockStateId(new Vec3(x, ICE_Y, z), iceId)
      chunk.setBlockLight(new Vec3(x, ICE_Y, z), 15)
      chunk.setSkyLight(new Vec3(x, ICE_Y, z), 15)
    }
  }
  return chunk.toJson()
}

function meshColumns(columnOrigins: Array<{ x: number; z: number }>, targetX: number, targetZ: number, options?: { forceMulti?: boolean }): WasmGeometryOutput {
  const meta = getBlockMeta(VERSION)
  const conversions = columnOrigins.map(({ x, z }) => {
    const chunkJson = buildIceOverWaterColumn()
    return convertChunkToWasm(chunkJson, VERSION, x, z, WORLD_MIN_Y, WORLD_MAX_Y)
  })

  if (conversions.length === 1 && !options?.forceMulti) {
    const c = conversions[0]
    return wasmModule.generate_geometry(
      targetX,
      WORLD_MIN_Y,
      targetZ,
      COLUMN_HEIGHT,
      WORLD_MIN_Y,
      WORLD_MAX_Y,
      WORLD_MIN_Y,
      c.blockStates,
      c.blockLight,
      c.skyLight,
      c.biomesArray,
      meta.invisibleBlocks,
      meta.transparentBlocks,
      meta.noAoBlocks,
      meta.cullIdenticalBlocks,
      meta.occludingBlocks,
      true,
      false,
      15
    ) as WasmGeometryOutput
  }

  const perChunkLen = conversions[0].blockStates.length
  const xs = new Int32Array(columnOrigins.length)
  const zs = new Int32Array(columnOrigins.length)
  const blockStatesAll = new Uint16Array(perChunkLen * columnOrigins.length)
  const blockLightAll = new Uint8Array(perChunkLen * columnOrigins.length)
  const skyLightAll = new Uint8Array(perChunkLen * columnOrigins.length)
  const biomesAll = new Uint8Array(perChunkLen * columnOrigins.length)

  for (let i = 0; i < columnOrigins.length; i++) {
    const c = conversions[i]
    xs[i] = columnOrigins[i].x
    zs[i] = columnOrigins[i].z
    blockStatesAll.set(c.blockStates, perChunkLen * i)
    blockLightAll.set(c.blockLight, perChunkLen * i)
    skyLightAll.set(c.skyLight, perChunkLen * i)
    biomesAll.set(c.biomesArray, perChunkLen * i)
  }

  const first = conversions[0]
  return (wasmModule as any).generate_geometry_multi(
    targetX,
    WORLD_MIN_Y,
    targetZ,
    COLUMN_HEIGHT,
    WORLD_MIN_Y,
    WORLD_MAX_Y,
    WORLD_MIN_Y,
    xs,
    zs,
    blockStatesAll,
    blockLightAll,
    skyLightAll,
    biomesAll,
    first.invisibleBlocks,
    first.transparentBlocks,
    first.noAoBlocks,
    first.cullIdenticalBlocks,
    first.occludingBlocks,
    true,
    false,
    15
  ) as WasmGeometryOutput
}

function countIceBorderFaces(output: WasmGeometryOutput, iceStateId: number, planeX: number, faceBit: number) {
  let count = 0
  for (const block of output.blocks) {
    if (block.block_state_id !== iceStateId) continue
    const [bx, by] = block.position
    if (bx !== planeX || by !== ICE_Y) continue
    if ((block.visible_faces & faceBit) !== 0) count++
  }
  return count
}

test('cross-column ice culling: two adjacent columns produce zero border faces', () => {
  const iceStateId = resolveStateId('ice')
  const output = meshColumns(
    [
      { x: 0, z: 0 },
      { x: 16, z: 0 }
    ],
    0,
    0
  )

  expect(countIceBorderFaces(output, iceStateId, 15, EAST_FACE)).toBe(0)
  expect(countIceBorderFaces(output, iceStateId, 16, WEST_FACE)).toBe(0)
})

test('cross-column ice culling: negative coordinates', () => {
  const iceStateId = resolveStateId('ice')
  const ax = -504928
  const bx = ax + 16
  const z = 496768
  const output = meshColumns(
    [
      { x: ax, z },
      { x: bx, z }
    ],
    ax,
    z
  )

  expect(countIceBorderFaces(output, iceStateId, ax + 15, EAST_FACE)).toBe(0)
  expect(countIceBorderFaces(output, iceStateId, bx, WEST_FACE)).toBe(0)
})

test('cross-column ice culling: healed mesh has fewer blocks at the shared boundary plane', () => {
  const alone = meshColumns([{ x: 0, z: 0 }], 0, 0, { forceMulti: true })
  const pair = meshColumns(
    [
      { x: 0, z: 0 },
      { x: 16, z: 0 }
    ],
    0,
    0
  )
  const aloneBoundaryBlocks = alone.blocks.filter(b => b.position[0] === 15 && b.position[1] === ICE_Y).length
  const pairBoundaryBlocks = pair.blocks.filter(b => b.position[0] === 15 && b.position[1] === ICE_Y).length
  expect(aloneBoundaryBlocks).toBeGreaterThanOrEqual(pairBoundaryBlocks)
  expect(pair.blocks.filter(b => b.position[0] === 16 && b.position[1] === ICE_Y && (b.visible_faces & WEST_FACE) !== 0).length).toBe(0)
})
