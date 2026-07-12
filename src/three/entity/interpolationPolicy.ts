export const LOCAL_MOVEMENT_TWEEN_DURATION_MS = 50
export const ENTITY_TWEEN_DURATION_MS = 120

export type Vec3Like = { x: number; y: number; z: number }

export type EntityRenderHints = {
  localVehicle?: boolean
  boatWaterPatchVisible?: boolean
  boatPassengerIds?: number[]
}

export type EntityWithRenderHints = {
  renderHints?: EntityRenderHints
}

export function usesCameraSyncedVehiclePosition(entity: EntityWithRenderHints | undefined): boolean {
  return !!entity?.renderHints?.localVehicle
}

export function getEntityTweenDurationMs(entity: EntityWithRenderHints | undefined, justAdded: boolean): number {
  if (justAdded) return 0
  if (usesCameraSyncedVehiclePosition(entity)) return 0
  return ENTITY_TWEEN_DURATION_MS
}

/** Local vehicle X/Z follow camera tween; Y uses latest vehicle physics height. */
export function getLocalVehicleWorldPosition(cameraWorldPos: Vec3Like, vehicleY: number): Vec3Like {
  return {
    x: cameraWorldPos.x,
    y: vehicleY,
    z: cameraWorldPos.z
  }
}

const BOAT_PASSENGER_RIDING_OFFSET_Y = -0.1
const PLAYER_RIDING_OFFSET_Y = -0.35

export function getBoatPassengerSeatOffset(passengerIndex: number, passengerCount: number): number {
  if (passengerCount <= 1) return 0
  return passengerIndex === 0 ? 0.2 : -0.6
}

/** Vanilla 1.17.1 Boat#positionRider position, without applying the passenger pose. */
export function getBoatPassengerWorldPosition(boatWorldPos: Vec3Like, boatYaw: number, passengerIndex: number, passengerCount: number): Vec3Like {
  const seatOffset = getBoatPassengerSeatOffset(passengerIndex, passengerCount)
  return {
    x: boatWorldPos.x - Math.sin(boatYaw) * seatOffset,
    y: boatWorldPos.y + BOAT_PASSENGER_RIDING_OFFSET_Y + PLAYER_RIDING_OFFSET_Y,
    z: boatWorldPos.z + Math.cos(boatYaw) * seatOffset
  }
}
