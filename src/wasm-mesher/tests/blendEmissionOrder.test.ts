import { beforeAll, beforeEach, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import Chunks from 'prismarine-chunk'
import MinecraftData from 'minecraft-data'
import { Vec3 } from 'vec3'
import blocksAtlasesJson from 'mc-assets/dist/blocksAtlases.json'
import blockStatesModels from 'mc-assets/dist/blockStatesModels.json'
import { World } from '../../mesher-shared/world'
import { setBlockStatesData } from '../../mesher-shared/models'
import { resetFaceOcclusionCache } from '../../mesher-shared/faceOcclusion'
import { convertChunkToWasm, getBlockMeta } from '../bridge/convertChunk'
import { renderWasmOutputToGeometry } from '../bridge/render-from-wasm'

const VERSION = '1.17.1'
const SECTION_Y = 0
const ICE_Y = 2
const WATER_Y = 1
const WORLD_MIN_Y = 0
const WORLD_MAX_Y = 256
const COLUMN_HEIGHT = WORLD_MAX_Y - WORLD_MIN_Y

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

function buildIceOverWaterWorld(): World {
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
      chunk.setBlockLight(new Vec3(x, WATER_Y, z), 15)
      chunk.setSkyLight(new Vec3(x, WATER_Y, z), 15)
    }
  }

  const world = new World(VERSION)
  world.addColumn(0, 0, chunk.toJson())
  return world
}

function findLiquidBeforeBlockIndexSplit(indices: number[]) {
  for (let split = 1; split < indices.length; split++) {
    const prefix = indices.slice(0, split)
    const suffix = indices.slice(split)
    const maxPrefix = Math.max(...prefix)
    const minSuffix = Math.min(...suffix)
    if (maxPrefix < minSuffix) {
      return { split, liquidVertexCount: minSuffix }
    }
  }
  return null
}

test('blend emission order: liquid quads precede ice block quads in the index buffer', () => {
  const world = buildIceOverWaterWorld()
  const meta = getBlockMeta(VERSION)
  const column = world.getColumn(0, 0)!
  const conversion = convertChunkToWasm(column, VERSION, 0, 0, WORLD_MIN_Y, WORLD_MAX_Y)
  const wasmResult = wasmModule.generate_geometry(
    0,
    WORLD_MIN_Y,
    0,
    COLUMN_HEIGHT,
    WORLD_MIN_Y,
    WORLD_MAX_Y,
    WORLD_MIN_Y,
    conversion.blockStates,
    conversion.blockLight,
    conversion.skyLight,
    conversion.biomesArray,
    meta.invisibleBlocks,
    meta.transparentBlocks,
    meta.noAoBlocks,
    meta.cullIdenticalBlocks,
    meta.occludingBlocks,
    true,
    false,
    15
  )

  const section = renderWasmOutputToGeometry(wasmResult, VERSION, `0,${SECTION_Y},0`, { x: 8, y: 8, z: 8 }, world, {
    sectionHeight: 16,
    shaderCubes: false
  })

  const blend = section.blendGeometry
  expect(blend).toBeDefined()
  expect(blend!.indices.length).toBeGreaterThan(0)

  const split = findLiquidBeforeBlockIndexSplit(blend!.indices)
  expect(split).not.toBeNull()
  expect(split!.split).toBeGreaterThan(0)
  expect(split!.liquidVertexCount).toBeGreaterThan(0)
})
