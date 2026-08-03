import { PlayerAnimation } from 'skinview3d'

export class WalkingGeneralSwing extends PlayerAnimation {
  switchAnimationCallback?: (animation: string) => void
  isRunning: boolean
  isMoving: boolean
  isCrouched: boolean
  isRiding: boolean
  _dt: number
  _phase: number
  _moveBlend: number
  _rideBlend: number
  _swingTime: number | null
  _swingDuration: number
  _defaults: {
    bodyPos: any
    bodyRot: any
    leftArmPos: any
    leftArmRot: any
    rightArmPos: any
    rightArmRot: any
    leftLegPos: any
    leftLegRot: any
    rightLegPos: any
    rightLegRot: any
    headPos: any
    headRot: any
    capePos: any
    capeRot: any
    elytraPos: any
    elytraRot: any
  } | null

  update(player: any, delta: number): void
  swingArm(): void
}
