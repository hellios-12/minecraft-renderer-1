import * as THREE from 'three'
import { expect, test } from 'vitest'
import {
  BOAT_HULL_RENDER_ORDER,
  BOAT_OBJ_OFFSET_Y,
  BOAT_WATER_PATCH_CENTER_Y,
  BOAT_WATER_PATCH_CENTER_Z,
  BOAT_WATER_PATCH_DEPTH,
  BOAT_WATER_PATCH_HEIGHT,
  BOAT_WATER_PATCH_NAME,
  BOAT_WATER_PATCH_RENDER_ORDER,
  BOAT_WATER_PATCH_WIDTH,
  BOAT_WATER_PATCH_WORLD_BOUNDS,
  applyBoatHullRenderSettings,
  createBoatWaterPatchMesh,
  getBoatWaterPatchEntitySpaceBounds,
  setupBoatMesh,
} from './boatRenderSetup'

test('water patch uses vanilla dimensions in blocks', () => {
  const patch = createBoatWaterPatchMesh()
  const size = new THREE.Vector3()
  patch.geometry.computeBoundingBox()
  patch.geometry.boundingBox!.getSize(size)
  expect(size.x).toBeCloseTo(BOAT_WATER_PATCH_WIDTH, 5)
  expect(size.y).toBeCloseTo(BOAT_WATER_PATCH_HEIGHT, 5)
  expect(size.z).toBeCloseTo(BOAT_WATER_PATCH_DEPTH, 5)
})

test('water patch local center matches vanilla OBJ placement', () => {
  const patch = createBoatWaterPatchMesh()
  expect(patch.position.x).toBe(0)
  expect(patch.position.y).toBeCloseTo(BOAT_WATER_PATCH_CENTER_Y, 5)
  expect(patch.position.z).toBeCloseTo(BOAT_WATER_PATCH_CENTER_Z, 5)
})

test('water patch entity-space bounds match vanilla world-relative bounds', () => {
  const bounds = getBoatWaterPatchEntitySpaceBounds(BOAT_OBJ_OFFSET_Y)
  expect(bounds.minX).toBeCloseTo(BOAT_WATER_PATCH_WORLD_BOUNDS.minX, 5)
  expect(bounds.maxX).toBeCloseTo(BOAT_WATER_PATCH_WORLD_BOUNDS.maxX, 5)
  expect(bounds.minY).toBeCloseTo(BOAT_WATER_PATCH_WORLD_BOUNDS.minY, 5)
  expect(bounds.maxY).toBeCloseTo(BOAT_WATER_PATCH_WORLD_BOUNDS.maxY, 5)
  expect(bounds.minZ).toBeCloseTo(BOAT_WATER_PATCH_WORLD_BOUNDS.minZ, 5)
  expect(bounds.maxZ).toBeCloseTo(BOAT_WATER_PATCH_WORLD_BOUNDS.maxZ, 5)
})

test('water patch material is depth-only', () => {
  const patch = createBoatWaterPatchMesh()
  const material = patch.material as THREE.MeshBasicMaterial
  expect(material.colorWrite).toBe(false)
  expect(material.depthWrite).toBe(true)
  expect(material.depthTest).toBe(true)
})

test('boat hull renders in opaque list before depth-only patch', () => {
  const root = new THREE.Object3D()
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.1 }),
  )
  hull.name = 'bottom'
  root.add(hull)
  const { waterPatch } = setupBoatMesh(root)

  expect(hull.renderOrder).toBe(BOAT_HULL_RENDER_ORDER)
  expect(waterPatch.renderOrder).toBe(BOAT_WATER_PATCH_RENDER_ORDER)
  expect(waterPatch.renderOrder).toBeGreaterThan(hull.renderOrder)
  expect(waterPatch.name).toBe(BOAT_WATER_PATCH_NAME)
})

test('boat hull material is alpha-tested opaque with depth write', () => {
  const root = new THREE.Object3D()
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.05 }),
  )
  root.add(hull)
  applyBoatHullRenderSettings(root)
  const material = hull.material as THREE.MeshBasicMaterial
  expect(material.transparent).toBe(false)
  expect(material.alphaTest).toBeGreaterThanOrEqual(0.1)
  expect(material.depthWrite).toBe(true)
  expect(material.depthTest).toBe(true)
})
