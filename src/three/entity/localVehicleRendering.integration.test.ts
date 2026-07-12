import * as THREE from 'three'
import { expect, test, vi } from 'vitest'
import { SceneOrigin } from '../sceneOrigin'
import { anchorBoatPassengerPosition, releaseBoatPassengerPosition } from './boatPassengerRendering'
import { getBoatPassengerWorldPosition, getLocalVehicleWorldPosition } from './interpolationPolicy'

type Vec3 = { x: number; y: number; z: number }

function staleOffsetVehiclePosition(cameraWorldPos: Vec3, vehiclePosition: Vec3, stalePassengerPosition: Vec3): Vec3 {
  return {
    x: cameraWorldPos.x + (vehiclePosition.x - stalePassengerPosition.x),
    y: cameraWorldPos.y + (vehiclePosition.y - stalePassengerPosition.y),
    z: cameraWorldPos.z + (vehiclePosition.z - stalePassengerPosition.z)
  }
}

test('stale passenger snapshot does not shift rendered boat X/Z relative to camera', () => {
  const stalePassenger = { x: 0, y: 63, z: 0 }
  const newVehicle = { x: 1, y: 63.2, z: 2 }
  const cameraWorldPos = { x: 0.4, y: 63.5, z: 0.8 }

  // 1. Vehicle position updates before passenger sync.
  // 2. Renderer receives vehicle snapshot while passenger is still stale.
  const broken = staleOffsetVehiclePosition(cameraWorldPos, newVehicle, stalePassenger)
  const rendered = getLocalVehicleWorldPosition(cameraWorldPos, newVehicle.y)

  expect(rendered.x).toBe(cameraWorldPos.x)
  expect(rendered.z).toBe(cameraWorldPos.z)
  expect(rendered.y).toBe(newVehicle.y)
  expect(broken.x).not.toBe(cameraWorldPos.x)
  expect(broken.z).not.toBe(cameraWorldPos.z)

  // 3. Passenger synchronizes to vehicle.
  const syncedPassenger = { ...newVehicle, y: 63 }
  const syncedCamera = { x: 0.8, y: 63.5, z: 1.6 }

  // 4. Boat X/Z remain fixed relative to the player/camera on intermediate frames.
  const afterSync = getLocalVehicleWorldPosition(syncedCamera, newVehicle.y)
  expect(afterSync.x - syncedCamera.x).toBe(0)
  expect(afterSync.z - syncedCamera.z).toBe(0)
  expect(afterSync.y).toBe(newVehicle.y)
  expect(syncedPassenger.x).toBe(newVehicle.x)
  expect(syncedPassenger.z).toBe(newVehicle.z)
})

test('render frames between press and release keep zero horizontal delta to camera', () => {
  const vehicleY = 62.75
  const frames = [
    { x: 0, y: 63.4, z: 0 },
    { x: 0.2, y: 63.4, z: 0 },
    { x: 0.45, y: 63.4, z: 0 },
    { x: 0.7, y: 63.4, z: 0 },
    { x: 0.7, y: 63.4, z: 0 },
    { x: 0.55, y: 63.4, z: 0 }
  ]

  for (const camera of frames) {
    const boat = getLocalVehicleWorldPosition(camera, vehicleY)
    expect(boat.x - camera.x).toBe(0)
    expect(boat.z - camera.z).toBe(0)
    expect(boat.y).toBe(vehicleY)
    expect(boat.y).not.toBe(camera.y)
  }
})

test('boat passenger positions use vanilla 1.17.1 riding and seat offsets', () => {
  const boat = { x: 10, y: 64, z: 20 }

  expect(getBoatPassengerWorldPosition(boat, 0, 0, 1)).toEqual({
    x: 10,
    y: 63.55,
    z: 20
  })
  expect(getBoatPassengerWorldPosition(boat, 0, 0, 2)).toEqual({
    x: 10,
    y: 63.55,
    z: 20.2
  })
  expect(getBoatPassengerWorldPosition(boat, 0, 1, 2)).toEqual({
    x: 10,
    y: 63.55,
    z: 19.4
  })

  const rotated = getBoatPassengerWorldPosition(boat, Math.PI / 2, 0, 2)
  expect(rotated.x).toBeCloseTo(9.8)
  expect(rotated.y).toBe(63.55)
  expect(rotated.z).toBeCloseTo(20)
})

test('remote player follows the tracked boat each frame and releases from an empty passenger list', () => {
  const sceneOrigin = new SceneOrigin(new THREE.Scene())
  sceneOrigin.update(96, 60, 192)

  const boat = new THREE.Group()
  sceneOrigin.track(boat)
  boat.position.set(100, 64, 200)

  const passenger = new THREE.Group()
  const stopPositionTween = vi.fn()
  passenger.userData._posTween = { stop: stopPositionTween }
  sceneOrigin.track(passenger)
  passenger.position.set(90, 64, 190)

  const firstPassengerPosition = getBoatPassengerWorldPosition(sceneOrigin.getWorldPosition(boat)!, boat.rotation.y, 0, 1)
  anchorBoatPassengerPosition(passenger, firstPassengerPosition, '10')

  expect(stopPositionTween).toHaveBeenCalledOnce()
  expect(sceneOrigin.getWorldPosition(passenger)).toEqual({ x: 100, y: 63.55, z: 200 })
  expect(passenger.userData._tweenTarget).toEqual({ x: 100, y: 63.55, z: 200 })

  boat.position.set(102, 64.2, 203)
  boat.rotation.y = Math.PI / 2
  const movedPassengerPosition = getBoatPassengerWorldPosition(sceneOrigin.getWorldPosition(boat)!, boat.rotation.y, 0, 1)
  anchorBoatPassengerPosition(passenger, movedPassengerPosition, '10')
  expect(sceneOrigin.getWorldPosition(passenger)?.x).toBe(102)
  expect(sceneOrigin.getWorldPosition(passenger)?.y).toBeCloseTo(63.75)
  expect(sceneOrigin.getWorldPosition(passenger)?.z).toBe(203)

  sceneOrigin.update(112, 70, 208)
  expect(sceneOrigin.getWorldPosition(passenger)?.x).toBe(102)
  expect(sceneOrigin.getWorldPosition(passenger)?.y).toBeCloseTo(63.75)
  expect(sceneOrigin.getWorldPosition(passenger)?.z).toBe(203)

  const detachedWorldPosition = sceneOrigin.getWorldPosition(passenger)
  expect(releaseBoatPassengerPosition(passenger, '10', detachedWorldPosition)).toBe(true)
  expect(passenger.userData._boatPassengerVehicleId).toBeUndefined()
  expect(passenger.userData._tweenTarget).toEqual(detachedWorldPosition)

  boat.position.set(110, 65, 210)
  expect(sceneOrigin.getWorldPosition(passenger)).toEqual(detachedWorldPosition)
})
