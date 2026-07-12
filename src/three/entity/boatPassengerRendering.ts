import type { Vec3Like } from './interpolationPolicy'

export type BoatPassengerRenderState = {
  position: {
    set: (x: number, y: number, z: number) => unknown
  }
  userData: {
    _posTween?: { stop: () => unknown }
    _tweenTarget?: Vec3Like
    _boatPassengerVehicleId?: string
  }
}

export function anchorBoatPassengerPosition(passenger: BoatPassengerRenderState, passengerWorldPos: Vec3Like, vehicleId: string): void {
  passenger.userData._posTween?.stop()
  passenger.userData._posTween = undefined
  passenger.userData._tweenTarget ??= { ...passengerWorldPos }
  Object.assign(passenger.userData._tweenTarget, passengerWorldPos)
  passenger.position.set(passengerWorldPos.x, passengerWorldPos.y, passengerWorldPos.z)
  passenger.userData._boatPassengerVehicleId = vehicleId
}

export function releaseBoatPassengerPosition(passenger: BoatPassengerRenderState, vehicleId: string, currentWorldPos: Vec3Like | undefined): boolean {
  if (passenger.userData._boatPassengerVehicleId !== vehicleId) return false
  passenger.userData._posTween?.stop()
  passenger.userData._posTween = undefined
  if (currentWorldPos) {
    passenger.userData._tweenTarget ??= { ...currentWorldPos }
    Object.assign(passenger.userData._tweenTarget, currentWorldPos)
  }
  delete passenger.userData._boatPassengerVehicleId
  return true
}
