import * as THREE from 'three'
import { BOAT_MESH_YAW_OFFSET } from './boatModelRotation'

/** Vanilla BoatModel.createWaterPatch() size in blocks (after X rotation). */
export const BOAT_WATER_PATCH_WIDTH = 28 / 16
export const BOAT_WATER_PATCH_HEIGHT = 3 / 16
export const BOAT_WATER_PATCH_DEPTH = 16 / 16

/** OBJ boat root offset applied in EntityMesh. */
export const BOAT_OBJ_OFFSET_Y = -1

/**
 * Vanilla 1.17.1 water patch center in OBJ-local space.
 * World-relative bounds with BOAT_OBJ_OFFSET_Y: X [-0.875,0.875], Y [0.375,0.5625], Z [-0.5,0.5].
 */
export const BOAT_WATER_PATCH_CENTER_Y = 1.46875
export const BOAT_WATER_PATCH_CENTER_Z = 0

export const BOAT_WATER_PATCH_WORLD_BOUNDS = {
  minX: -0.875,
  maxX: 0.875,
  minY: 0.375,
  maxY: 0.5625,
  minZ: -0.5,
  maxZ: 0.5
} as const

export const BOAT_HULL_RENDER_ORDER = 0
export const BOAT_WATER_PATCH_RENDER_ORDER = 1

export const BOAT_WATER_PATCH_NAME = 'boat_water_patch'

export function getBoatMeshYawOffset(): number {
  return BOAT_MESH_YAW_OFFSET
}

export function createBoatWaterPatchGeometry(): THREE.BoxGeometry {
  return new THREE.BoxGeometry(BOAT_WATER_PATCH_WIDTH, BOAT_WATER_PATCH_HEIGHT, BOAT_WATER_PATCH_DEPTH)
}

export function createBoatWaterPatchMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: true,
    depthTest: true
  })
}

export function createBoatWaterPatchMesh(): THREE.Mesh {
  const mesh = new THREE.Mesh(createBoatWaterPatchGeometry(), createBoatWaterPatchMaterial())
  mesh.name = BOAT_WATER_PATCH_NAME
  mesh.position.set(0, BOAT_WATER_PATCH_CENTER_Y, BOAT_WATER_PATCH_CENTER_Z)
  mesh.renderOrder = BOAT_WATER_PATCH_RENDER_ORDER
  return mesh
}

export function applyBoatHullRenderSettings(root: THREE.Object3D): void {
  root.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return
    if (child.name === BOAT_WATER_PATCH_NAME) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of materials) {
      if (!(material instanceof THREE.Material)) continue
      material.transparent = false
      material.depthWrite = true
      material.depthTest = true
      if ('alphaTest' in material) {
        material.alphaTest = Math.max(material.alphaTest ?? 0, 0.1)
      }
      material.needsUpdate = true
    }
    child.renderOrder = BOAT_HULL_RENDER_ORDER
  })
}

export function getBoatWaterPatchEntitySpaceBounds(objOffsetY = BOAT_OBJ_OFFSET_Y) {
  const centerY = objOffsetY + BOAT_WATER_PATCH_CENTER_Y
  const halfHeight = BOAT_WATER_PATCH_HEIGHT / 2
  const halfWidth = BOAT_WATER_PATCH_WIDTH / 2
  const halfDepth = BOAT_WATER_PATCH_DEPTH / 2
  return {
    minX: -halfWidth,
    maxX: halfWidth,
    minY: centerY - halfHeight,
    maxY: centerY + halfHeight,
    minZ: BOAT_WATER_PATCH_CENTER_Z - halfDepth,
    maxZ: BOAT_WATER_PATCH_CENTER_Z + halfDepth
  }
}

export function setupBoatMesh(root: THREE.Object3D): { waterPatch: THREE.Mesh } {
  applyBoatHullRenderSettings(root)
  const waterPatch = createBoatWaterPatchMesh()
  waterPatch.visible = false
  root.add(waterPatch)
  root.userData.boatWaterPatch = waterPatch
  return { waterPatch }
}

export function disposeBoatWaterPatch(root: THREE.Object3D): void {
  const patch = root.userData.boatWaterPatch as THREE.Mesh | undefined
  if (!patch) return
  patch.geometry.dispose()
  if (patch.material instanceof THREE.Material) {
    patch.material.dispose()
  }
  delete root.userData.boatWaterPatch
}
