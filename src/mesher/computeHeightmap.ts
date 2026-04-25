import { Vec3 } from 'vec3'
import { World } from './world'
import { INVISIBLE_BLOCKS } from './worldConstants'

/**
 * Compute the surface heightmap for one 16x16 chunk column.
 *
 * Returns a 256-entry Int16Array indexed as `z * 16 + x`, where each entry is
 * the world-Y of the highest non-INVISIBLE block in that column, or -32768
 * if no such block exists.
 *
 * Shared by the JS-mode mesher (`mesher.ts`) and WASM-mode mesher
 * (`mesherWasm.ts`) `getHeightmap` handlers to guarantee element-wise parity.
 */
export function computeHeightmap(world: World, chunkX: number, chunkZ: number): Int16Array {
  const heightmap = new Int16Array(256)

  const blockPos = new Vec3(0, 0, 0)
  for (let z = 0; z < 16; z++) {
    for (let x = 0; x < 16; x++) {
      blockPos.x = x + chunkX
      blockPos.z = z + chunkZ
      blockPos.y = world.config.worldMaxY
      let block = world.getBlock(blockPos)
      while (block && INVISIBLE_BLOCKS.has(block.name) && blockPos.y > world.config.worldMinY) {
        blockPos.y -= 1
        block = world.getBlock(blockPos)
      }
      const index = z * 16 + x
      heightmap[index] = block ? blockPos.y : -32768
    }
  }
  return heightmap
}

/**
 * Shared `getHeightmap` worker-handler logic.
 *
 * Both `mesher.ts` and `mesherWasm.ts` route their `case 'getHeightmap'` here so
 * the post-message payload (key + heightmap) is computed in exactly one place.
 * Test fixtures (see `wasm-mesher/test-section-boundary.ts`) invoke this helper
 * directly to exercise the real handler path end-to-end.
 */
export function handleGetHeightmap(world: World, x: number, z: number): { key: string, heightmap: Int16Array } {
  const heightmap = computeHeightmap(world, x, z)
  const key = `${Math.floor(x / 16)},${Math.floor(z / 16)}`
  return { key, heightmap }
}
