import MinecraftData from 'minecraft-data'
import PrismarineBlockLoader from 'prismarine-block'
import moreBlockDataGeneratedJson from '../lib/moreBlockDataGenerated.json'

export type OccludingBlockMeta = {
  occludingBlocks: Uint16Array
  occludingLookup: Uint8Array
}

const metaCache = new Map<string, OccludingBlockMeta>()

const isCube = (shapes: unknown) => {
  if (!shapes || !Array.isArray(shapes) || shapes.length !== 1) return false
  const s = shapes[0] as number[]
  return s[0] === 0 && s[1] === 0 && s[2] === 0 && s[3] === 1 && s[4] === 1 && s[5] === 1
}

/** Opaque full-cube state ids used for face culling and VisGraph — single source of truth. */
export const getOccludingBlockMeta = (version: string): OccludingBlockMeta => {
  const cached = metaCache.get(version)
  if (cached) return cached

  const mcData = MinecraftData(version)
  const Block = PrismarineBlockLoader(version)
  const noOcclusionsSet = new Set(Object.keys(moreBlockDataGeneratedJson.noOcclusions))

  const occludingBlockIds: number[] = []
  for (const idStr of Object.keys((mcData as { blocksByStateId: Record<string, unknown> }).blocksByStateId)) {
    const id = Number(idStr)
    if (!id) continue
    const b = (
      Block as { fromStateId: (id: number, y: number) => { transparent?: boolean; boundingBox?: string; name: string; shapes?: unknown } | null }
    ).fromStateId(id, 0)
    if (!b) continue
    if (b.transparent) continue
    if (b.boundingBox !== 'block') continue
    if (noOcclusionsSet.has(b.name)) continue
    if (!isCube(b.shapes)) continue
    occludingBlockIds.push(id)
  }

  const occludingBlocks = new Uint16Array(occludingBlockIds)
  const maxId = occludingBlockIds.length ? Math.max(...occludingBlockIds) : 0
  const occludingLookup = new Uint8Array(maxId + 1)
  for (const id of occludingBlockIds) {
    occludingLookup[id] = 1
  }

  const meta = { occludingBlocks, occludingLookup }
  metaCache.set(version, meta)
  return meta
}
