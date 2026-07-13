import type { PlayerObjectType } from '../../lib/createPlayerObject'

export type NetworkHeadPitchState = {
  _networkHeadPitch?: number
}

export function storeNetworkHeadPitch(userData: NetworkHeadPitchState, pitch: unknown): void {
  if (typeof pitch === 'number' && Number.isFinite(pitch)) {
    userData._networkHeadPitch = pitch
  }
}

export function applyNetworkHeadPitch(playerObject: PlayerObjectType, userData: NetworkHeadPitchState): void {
  const pitch = userData._networkHeadPitch
  if (typeof pitch !== 'number' || !Number.isFinite(pitch)) return
  playerObject.skin.head.rotation.y = 0
  playerObject.skin.head.rotation.x = -pitch
}
