import { expect, test } from 'vitest'
import {
  ENTITY_TWEEN_DURATION_MS,
  LOCAL_MOVEMENT_TWEEN_DURATION_MS,
  getEntityTweenDurationMs,
  getLocalVehicleWorldPosition,
  usesCameraSyncedVehiclePosition,
} from './interpolationPolicy'

test('local movement tween matches camera tween duration', () => {
  expect(LOCAL_MOVEMENT_TWEEN_DURATION_MS).toBe(50)
})

test('ordinary entity tween stays at 120 ms', () => {
  expect(ENTITY_TWEEN_DURATION_MS).toBe(120)
})

test('local vehicle skips position tween', () => {
  expect(usesCameraSyncedVehiclePosition({ renderHints: { localVehicle: true } })).toBe(true)
  expect(getEntityTweenDurationMs({ renderHints: { localVehicle: true } }, false)).toBe(0)
  expect(getEntityTweenDurationMs({ renderHints: { localVehicle: true } }, true)).toBe(0)
})

test('remote entities keep ordinary tween duration', () => {
  expect(usesCameraSyncedVehiclePosition({ renderHints: { localVehicle: false } })).toBe(false)
  expect(getEntityTweenDurationMs({ renderHints: { localVehicle: false } }, false)).toBe(120)
  expect(getEntityTweenDurationMs({}, false)).toBe(120)
  expect(getEntityTweenDurationMs(undefined, false)).toBe(120)
})

test('local vehicle world position uses camera X/Z and vehicle Y', () => {
  const camera = { x: 10, y: 64.5, z: -3 }
  expect(getLocalVehicleWorldPosition(camera, 63.2)).toEqual({
    x: 10,
    y: 63.2,
    z: -3,
  })
})

test('intermediate camera frames keep boat X/Z aligned with player', () => {
  const vehicleY = 63.2
  const start = getLocalVehicleWorldPosition({ x: 0, y: 64, z: 0 }, vehicleY)
  const mid = getLocalVehicleWorldPosition({ x: 0.5, y: 64, z: 0 }, vehicleY)
  const end = getLocalVehicleWorldPosition({ x: 1, y: 64, z: 0 }, vehicleY)

  expect(start.x).toBe(0)
  expect(mid.x).toBe(0.5)
  expect(end.x).toBe(1)
  expect(start.z).toBe(mid.z)
  expect(mid.z).toBe(end.z)
  expect(start.y).toBe(vehicleY)
  expect(mid.y).toBe(vehicleY)
  expect(end.y).toBe(vehicleY)
})
