import { test, expect, beforeAll, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import Chunks from 'prismarine-chunk'
import MinecraftData from 'minecraft-data'
import { Vec3 } from 'vec3'
import PrismarineBlockLoader from 'prismarine-block'
import blocksAtlasesJson from 'mc-assets/dist/blocksAtlases.json'
import blockStatesModels from 'mc-assets/dist/blockStatesModels.json'
import { World } from '../../mesher-shared/world'
import { setBlockStatesData, getSectionGeometry } from '../../mesher-shared/models'
import { resetFaceOcclusionCache } from '../../mesher-shared/faceOcclusion'
import { convertChunkToWasm } from '../bridge/convertChunk'
import { renderWasmOutputToGeometry } from '../bridge/render-from-wasm'
import type { ExportedSection } from '../../mesher-shared/exportedGeometryTypes'

const VERSION = '1.18.2'
const SECTION_Y = 0
const SECTION_HEIGHT = 16

const DRY_STAIR_PROPS = { facing: 'east', half: 'bottom', shape: 'straight', waterlogged: false } as const

type BlockSpec = { x: number; y: number; z: number; name: string; props?: Record<string, string | boolean> }

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

function resolveStateId(mcData: ReturnType<typeof MinecraftData>, name: string, props?: Record<string, string | boolean>) {
  const block = mcData.blocksByName[name]
  if (!block) throw new Error(`Unknown block: ${name}`)
  if (!props || Object.keys(props).length === 0) return block.defaultState
  const Block = PrismarineBlockLoader(VERSION)
  const requested = { ...props }
  if (!('waterlogged' in requested)) requested.waterlogged = false

  const matches: number[] = []
  for (let id = block.minStateId; id <= block.maxStateId; id++) {
    const stateProps = Block.fromStateId(id, 1).getProperties() as Record<string, string | boolean>
    let match = true
    for (const [key, val] of Object.entries(requested)) {
      if (stateProps[key] !== val) {
        match = false
        break
      }
    }
    if (match) matches.push(id)
  }
  if (matches.length === 0) throw new Error(`No state for ${name} ${JSON.stringify(props)}`)
  return matches[0]!
}

function buildWorld(blocks: BlockSpec[]): World {
  const mcData = MinecraftData(VERSION)
  const Chunk = Chunks(VERSION) as any
  const chunk = new Chunk(undefined as any)

  for (const b of blocks) {
    const id = resolveStateId(mcData, b.name, b.props)
    chunk.setBlockStateId(new Vec3(b.x, b.y, b.z), id)
    chunk.setBlockLight(new Vec3(b.x, b.y, b.z), 15)
    chunk.setSkyLight(new Vec3(b.x, b.y, b.z), 15)
  }

  const world = new World(VERSION)
  world.addColumn(0, 0, chunk.toJson())
  return world
}

function countQuadsFromLegacy(world: World): number {
  const geo = getSectionGeometry(0, SECTION_Y, 0, world, SECTION_HEIGHT)
  const opaque = geo.indicesCount / 6
  const blend = geo.blend ? geo.blend.indices.length / 6 : 0
  return opaque + blend
}

function countQuadsFromWasm(world: World, shaderCubes = false): number {
  const column = world.getColumn(0, 0)!
  const conversion = convertChunkToWasm(column, VERSION, 0, 0, SECTION_Y, SECTION_Y + SECTION_HEIGHT, SECTION_Y, SECTION_HEIGHT)
  const wasmResult = wasmModule.generate_geometry(
    0,
    SECTION_Y,
    0,
    SECTION_HEIGHT,
    SECTION_Y,
    SECTION_Y + SECTION_HEIGHT,
    SECTION_Y,
    conversion.blockStates,
    conversion.blockLight,
    conversion.skyLight,
    conversion.biomesArray,
    conversion.invisibleBlocks,
    conversion.transparentBlocks,
    conversion.noAoBlocks,
    conversion.cullIdenticalBlocks,
    conversion.occludingBlocks,
    true,
    false,
    15
  )
  const section = renderWasmOutputToGeometry(wasmResult, VERSION, '0,0,0', { x: 8, y: 8, z: 8 }, world, {
    sectionHeight: SECTION_HEIGHT,
    shaderCubes
  })
  const opaque = section.geometry.indices.length / 6
  const blend = section.blendGeometry?.indices.length ? section.blendGeometry.indices.length / 6 : 0
  const shader = shaderCubes ? (section.shaderCubes?.count ?? 0) : 0
  return opaque + blend + shader
}

function assertMesherParity(world: World, expectedQuads: number) {
  const legacy = countQuadsFromLegacy(world)
  const wasmLegacy = countQuadsFromWasm(world, false)
  const wasmShader = countQuadsFromWasm(world, true)
  expect(legacy).toBe(expectedQuads)
  expect(wasmLegacy).toBe(expectedQuads)
  expect(wasmShader).toBe(expectedQuads)
}

function renderWasmSection(world: World, shaderCubes = false): ExportedSection {
  const column = world.getColumn(0, 0)!
  const conversion = convertChunkToWasm(column, VERSION, 0, 0, SECTION_Y, SECTION_Y + SECTION_HEIGHT, SECTION_Y, SECTION_HEIGHT)
  const wasmResult = wasmModule.generate_geometry(
    0,
    SECTION_Y,
    0,
    SECTION_HEIGHT,
    SECTION_Y,
    SECTION_Y + SECTION_HEIGHT,
    SECTION_Y,
    conversion.blockStates,
    conversion.blockLight,
    conversion.skyLight,
    conversion.biomesArray,
    conversion.invisibleBlocks,
    conversion.transparentBlocks,
    conversion.noAoBlocks,
    conversion.cullIdenticalBlocks,
    conversion.occludingBlocks,
    true,
    false,
    15
  )
  return renderWasmOutputToGeometry(wasmResult, VERSION, '0,0,0', { x: 8, y: 8, z: 8 }, world, {
    sectionHeight: SECTION_HEIGHT,
    shaderCubes
  })
}

/** Inset stair riser in cell (bx, by, bz): normal along expectedNx, all four verts on the cell mid-x-plane and within the cell AABB. */
function hasInsetHorizontalRiser(
  section: ExportedSection,
  bx: number,
  by: number,
  bz: number,
  expectedNx: 1 | -1
): boolean {
  const pos = section.geometry.positions
  const norm = section.geometry.normals
  const idx = section.geometry.indices
  const eps = 1e-3
  const minX = (bx & 15) - 8
  const maxX = minX + 1
  const minY = (by & 15) - 8
  const maxY = minY + 1
  const minZ = (bz & 15) - 8
  const maxZ = minZ + 1
  const riserX = minX + 0.5

  for (let i = 0; i < idx.length; i += 6) {
    const vertIndices = [...new Set([idx[i], idx[i + 1], idx[i + 2], idx[i + 3], idx[i + 4], idx[i + 5]])]
    if (vertIndices.length !== 4) continue

    const nx = norm[vertIndices[0]! * 3]!
    const ny = norm[vertIndices[0]! * 3 + 1]!
    const nz = norm[vertIndices[0]! * 3 + 2]!
    if (Math.abs(ny) > eps || Math.abs(nz) > eps) continue
    if (Math.abs(nx - expectedNx) > eps) continue

    const onRiserPlane = vertIndices.every(vi => Math.abs(pos[vi * 3]! - riserX) < eps)
    if (!onRiserPlane) continue

    const inCell = vertIndices.every(vi => {
      const px = pos[vi * 3]!
      const py = pos[vi * 3 + 1]!
      const pz = pos[vi * 3 + 2]!
      return (
        px >= minX - eps &&
        px <= maxX + eps &&
        py >= minY - eps &&
        py <= maxY + eps &&
        pz >= minZ - eps &&
        pz <= maxZ + eps
      )
    })
    if (inCell) return true
  }
  return false
}

function stairWithStoneNeighbor(
  facing: 'east' | 'west' | 'south' | 'north',
  stone: { x: number; y: number; z: number }
): BlockSpec[] {
  return [
    { x: 0, y: 0, z: 0, name: 'cut_copper_stairs', props: { facing, half: 'bottom', shape: 'straight', waterlogged: false } },
    { x: stone.x, y: stone.y, z: stone.z, name: 'stone' }
  ]
}

function farmlandFieldBlocks(): BlockSpec[] {
  const blocks: BlockSpec[] = []
  for (let z = 0; z < 16; z++) {
    for (let x = 0; x < 16; x++) {
      blocks.push({ x, y: 4, z, name: 'dirt' })
      blocks.push({ x, y: 5, z, name: 'farmland' })
    }
  }
  return blocks
}

function slabFieldBlocks(): BlockSpec[] {
  const blocks: BlockSpec[] = []
  for (let z = 0; z < 4; z++) {
    for (let x = 0; x < 4; x++) {
      blocks.push({ x, y: 0, z, name: 'stone' })
      blocks.push({ x, y: 1, z, name: 'stone_slab' })
    }
  }
  return blocks
}

function cutCopperStairsRunBlocks(): BlockSpec[] {
  const blocks: BlockSpec[] = []
  for (let x = 0; x < 8; x++) {
    blocks.push({ x, y: 0, z: 0, name: 'cut_copper_stairs', props: { ...DRY_STAIR_PROPS } })
    blocks.push({ x, y: 0, z: 1, name: 'cut_copper_stairs', props: { ...DRY_STAIR_PROPS } })
  }
  return blocks
}

function cutCopperStairsAscentBlocks(): BlockSpec[] {
  const blocks: BlockSpec[] = []
  for (let x = 0; x < 6; x++) {
    blocks.push({ x, y: 0, z: 0, name: 'cut_copper_stairs', props: { ...DRY_STAIR_PROPS } })
    blocks.push({ x, y: 1, z: 0, name: 'cut_copper_stairs', props: { ...DRY_STAIR_PROPS } })
  }
  return blocks
}

function cutCopperStairsWestRunBlocks(): BlockSpec[] {
  const blocks: BlockSpec[] = []
  for (let x = 0; x < 8; x++) {
    blocks.push({
      x,
      y: 0,
      z: 0,
      name: 'cut_copper_stairs',
      props: { facing: 'west', half: 'bottom', shape: 'straight', waterlogged: false }
    })
    blocks.push({
      x,
      y: 0,
      z: 1,
      name: 'cut_copper_stairs',
      props: { facing: 'west', half: 'bottom', shape: 'straight', waterlogged: false }
    })
  }
  return blocks
}

function cutCopperStairsEastWestMirrorBlocks(): BlockSpec[] {
  const blocks: BlockSpec[] = []
  for (let x = 0; x < 3; x++) {
    blocks.push({ x, y: 0, z: 0, name: 'cut_copper_stairs', props: { ...DRY_STAIR_PROPS } })
  }
  for (let x = 0; x < 3; x++) {
    blocks.push({
      x: x + 4,
      y: 0,
      z: 0,
      name: 'cut_copper_stairs',
      props: { facing: 'west', half: 'bottom', shape: 'straight', waterlogged: false }
    })
  }
  return blocks
}

function countQuadsForFacing(facing: 'east' | 'west' | 'south' | 'north', half: 'bottom' | 'top'): number {
  const world = buildWorld([{ x: 0, y: 0, z: 0, name: 'cut_copper_stairs', props: { facing, half, shape: 'straight', waterlogged: false } }])
  return countQuadsFromWasm(world)
}

function glassLeavesClusterBlocks(): BlockSpec[] {
  return [
    { x: 0, y: 0, z: 0, name: 'stone' },
    { x: 1, y: 0, z: 0, name: 'glass' },
    { x: 0, y: 0, z: 1, name: 'oak_leaves' },
    { x: 1, y: 0, z: 1, name: 'glass' }
  ]
}

test('culling regression: farmland field — internal side faces culled (pre-fix ~8704 quads)', () => {
  const world = buildWorld(farmlandFieldBlocks())
  // Post-fix: 640 quads (legacy + WASM agree). Pre-fix was ~8704 with all internal farmland sides drawn.
  assertMesherParity(world, 640)
})

test('culling regression: slab field', () => {
  const world = buildWorld(slabFieldBlocks())
  assertMesherParity(world, 64)
})

test('culling regression: single cut copper stair legacy vs wasm', () => {
  const world = buildWorld([{ x: 0, y: 0, z: 0, name: 'cut_copper_stairs', props: { ...DRY_STAIR_PROPS } }])
  assertMesherParity(world, 11)
})

test('culling regression: cut copper stairs run (east-facing)', () => {
  const world = buildWorld(cutCopperStairsRunBlocks())
  assertMesherParity(world, 116)
})

test('culling regression: cut copper stairs run (west-facing, rotated)', () => {
  const world = buildWorld(cutCopperStairsWestRunBlocks())
  assertMesherParity(world, 116)
})

test('culling regression: cut copper stairs ascent', () => {
  const world = buildWorld(cutCopperStairsAscentBlocks())
  assertMesherParity(world, 106)
})

test('culling regression: 3 east + 3 west stairs mirror user scenario', () => {
  const world = buildWorld(cutCopperStairsEastWestMirrorBlocks())
  const legacy = countQuadsFromLegacy(world)
  const wasmLegacy = countQuadsFromWasm(world, false)
  const wasmShader = countQuadsFromWasm(world, true)
  expect(legacy).toBe(wasmLegacy)
  expect(legacy).toBe(wasmShader)
  // 6 stairs with 2 internal interfaces culled per row; gap at x=3 prevents east↔west culling
  expect(wasmShader).toBe(58)
  expect(wasmShader).toBeLessThan(3 * 11 * 2)
})

test('culling regression: all stair facings and top half match east baseline', () => {
  const east = countQuadsForFacing('east', 'bottom')
  expect(countQuadsForFacing('west', 'bottom')).toBe(east)
  expect(countQuadsForFacing('south', 'bottom')).toBe(east)
  expect(countQuadsForFacing('north', 'bottom')).toBe(east)
  expect(countQuadsForFacing('east', 'top')).toBe(east)
})

test('culling regression: glass/leaves cluster — see-through blocks not over-culled', () => {
  const world = buildWorld(glassLeavesClusterBlocks())
  // Leaves never occlude; glass self-culls. Baseline locks parity (pre shape-cull guard was 24 legacy-only).
  assertMesherParity(world, 20)
})

test('culling regression: cactus on grass — ground top face not culled (issue #73)', () => {
  const world = buildWorld([
    { x: 0, y: 0, z: 0, name: 'grass_block' },
    { x: 0, y: 1, z: 0, name: 'cactus' }
  ])
  // Pre-fix: grass top culled by cactus cosmetic cap → 14 quads. Post-fix: grass top drawn → 15.
  assertMesherParity(world, 15)
})

test('culling regression: cactus stacked on cactus — no over-cull holes', () => {
  const world = buildWorld([
    { x: 0, y: 0, z: 0, name: 'cactus' },
    { x: 0, y: 1, z: 0, name: 'cactus' }
  ])
  assertMesherParity(world, 12)
})

test('culling regression: cactus beside solid block — side faces still drawn', () => {
  const world = buildWorld([
    { x: 0, y: 0, z: 0, name: 'dirt' },
    { x: 1, y: 0, z: 0, name: 'cactus' }
  ])
  expect(countQuadsFromLegacy(world)).toBeGreaterThan(9)
  expect(countQuadsFromWasm(world, false)).toBeGreaterThan(9)
})

test('shader cubes: dirt UP face culled under farmland', () => {
  const world = buildWorld([
    { x: 0, y: 0, z: 0, name: 'dirt' },
    { x: 0, y: 1, z: 0, name: 'farmland' }
  ])
  assertMesherParity(world, 10)
})

test('shader cubes: dirt DOWN face culled under top slab', () => {
  const world = buildWorld([
    { x: 0, y: 0, z: 0, name: 'stone_slab', props: { type: 'top' } },
    { x: 0, y: 1, z: 0, name: 'dirt' }
  ])
  assertMesherParity(world, 10)
})

test('shader cubes: dirt side not culled beside bottom slab', () => {
  const world = buildWorld([
    { x: 0, y: 0, z: 0, name: 'dirt' },
    { x: 1, y: 0, z: 0, name: 'stone_slab', props: { type: 'bottom' } }
  ])
  const legacy = countQuadsFromLegacy(world)
  const wasmShader = countQuadsFromWasm(world, true)
  expect(wasmShader).toBe(legacy)
  expect(wasmShader).toBeGreaterThan(5)
})

test('culling regression: east-facing stair + stone to east — full silhouette, no inset riser drop (issue #81)', () => {
  const world = buildWorld(stairWithStoneNeighbor('east', { x: 1, y: 0, z: 0 }))
  assertMesherParity(world, 14)
})

test('culling regression: west-facing stair + stone to east — inset riser kept (issue #81)', () => {
  const world = buildWorld(stairWithStoneNeighbor('west', { x: 1, y: 0, z: 0 }))
  assertMesherParity(world, 16)
  expect(hasInsetHorizontalRiser(renderWasmSection(world), 0, 0, 0, 1)).toBe(true)
})

test('culling regression: south-facing stair + stone to south — inset riser kept (issue #81)', () => {
  const world = buildWorld(stairWithStoneNeighbor('south', { x: 0, y: 0, z: 1 }))
  // Tall half faces south toward stone (east/west analog); stone's north face is culled.
  assertMesherParity(world, 14)
})

test('culling regression: north-facing stair + stone to south — inset riser kept (issue #81)', () => {
  const world = buildWorld([
    { x: 0, y: 0, z: 0, name: 'cut_copper_stairs', props: { facing: 'north', half: 'bottom', shape: 'straight', waterlogged: false } },
    { x: 0, y: 0, z: 1, name: 'stone' }
  ])
  assertMesherParity(world, 16)
})

test('culling regression: all horizontal facings beside occluding cube — parity table (issue #81)', () => {
  const cases: Array<{ blocks: BlockSpec[]; quads: number }> = [
    { blocks: stairWithStoneNeighbor('east', { x: 1, y: 0, z: 0 }), quads: 14 },
    { blocks: stairWithStoneNeighbor('west', { x: 1, y: 0, z: 0 }), quads: 16 },
    { blocks: stairWithStoneNeighbor('south', { x: 0, y: 0, z: 1 }), quads: 14 },
    {
      blocks: [
        { x: 0, y: 0, z: 0, name: 'cut_copper_stairs', props: { facing: 'north', half: 'bottom', shape: 'straight', waterlogged: false } },
        { x: 0, y: 0, z: 1, name: 'stone' }
      ],
      quads: 16
    }
  ]
  for (const { blocks, quads } of cases) {
    assertMesherParity(buildWorld(blocks), quads)
  }
})

test('culling regression: sofa scene — acacia stairs risers beside stripped log (issue #81)', () => {
  const world = buildWorld([
    { x: 1, y: 0, z: 0, name: 'stripped_acacia_log' },
    { x: 1, y: 1, z: 0, name: 'acacia_pressure_plate' },
    { x: 0, y: 0, z: 0, name: 'acacia_stairs', props: { facing: 'west', half: 'bottom', shape: 'straight', waterlogged: false } },
    { x: 2, y: 0, z: 0, name: 'acacia_stairs', props: { facing: 'east', half: 'bottom', shape: 'straight', waterlogged: false } }
  ])
  assertMesherParity(world, 31)
  const section = renderWasmSection(world)
  expect(hasInsetHorizontalRiser(section, 0, 0, 0, 1)).toBe(true)
  expect(hasInsetHorizontalRiser(section, 2, 0, 0, -1)).toBe(true)
})
