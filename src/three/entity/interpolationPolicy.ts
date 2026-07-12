export const LOCAL_MOVEMENT_TWEEN_DURATION_MS = 50
export const ENTITY_TWEEN_DURATION_MS = 120

export type Vec3Like = { x: number; y: number; z: number }

export type EntityRenderHints = {
  localVehicle?: boolean
  boatWaterPatchVisible?: boolean
}

export type EntityWithRenderHints = {
  renderHints?: EntityRenderHints
}

export function usesCameraSyncedVehiclePosition (entity: EntityWithRenderHints | undefined): boolean {
  return !!entity?.renderHints?.localVehicle
}

export function getEntityTweenDurationMs (
  entity: EntityWithRenderHints | undefined,
  justAdded: boolean,
): number {
  if (justAdded) return 0
  if (usesCameraSyncedVehiclePosition(entity)) return 0
  return ENTITY_TWEEN_DURATION_MS
}

/** Local vehicle X/Z follow camera tween; Y uses latest vehicle physics height. */
export function getLocalVehicleWorldPosition (
  cameraWorldPos: Vec3Like,
  vehicleY: number,
): Vec3Like {
  return {
    x: cameraWorldPos.x,
    y: vehicleY,
    z: cameraWorldPos.z,
  }
}
