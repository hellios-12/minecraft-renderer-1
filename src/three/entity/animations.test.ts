import * as THREE from 'three'
import { PlayerObject } from 'skinview3d'
import { expect, test } from 'vitest'
import type { PlayerObjectType } from '../../lib/createPlayerObject'
import { WalkingGeneralSwing } from './animations'

const RIDING_LEG_X = -1.4137167
const RIDING_LEG_Y = Math.PI / 10
const RIDING_LEG_Z = Math.PI / 40
const RIDING_ARM_DELTA = Math.PI / 5

function makePlayerObject(): PlayerObjectType {
  const playerObject = new PlayerObject() as PlayerObjectType
  playerObject.skin.leftLeg.rotation.set(0.1, 0.05, -0.02)
  playerObject.skin.rightLeg.rotation.set(-0.08, -0.04, 0.03)
  playerObject.skin.leftArm.rotation.set(0.2, 0, 0.01)
  playerObject.skin.rightArm.rotation.set(-0.15, 0, -0.01)
  return playerObject
}

function captureRotations(playerObject: PlayerObjectType) {
  const { leftArm, rightArm, leftLeg, rightLeg } = playerObject.skin
  return {
    leftArm: leftArm.rotation.clone(),
    rightArm: rightArm.rotation.clone(),
    leftLeg: leftLeg.rotation.clone(),
    rightLeg: rightLeg.rotation.clone(),
  }
}

function runAnimationFrame(animation: WalkingGeneralSwing, playerObject: PlayerObjectType, dt = 0.05) {
  animation.update(playerObject, dt)
}

function expectRidingLegPose(playerObject: PlayerObjectType) {
  expect(playerObject.skin.rightLeg.rotation.x).toBeCloseTo(RIDING_LEG_X)
  expect(playerObject.skin.rightLeg.rotation.y).toBeCloseTo(RIDING_LEG_Y)
  expect(playerObject.skin.rightLeg.rotation.z).toBeCloseTo(RIDING_LEG_Z)

  expect(playerObject.skin.leftLeg.rotation.x).toBeCloseTo(RIDING_LEG_X)
  expect(playerObject.skin.leftLeg.rotation.y).toBeCloseTo(-RIDING_LEG_Y)
  expect(playerObject.skin.leftLeg.rotation.z).toBeCloseTo(-RIDING_LEG_Z)
}

test('riding sets exact leg X/Y/Z rotations', () => {
  const playerObject = makePlayerObject()
  const animation = new WalkingGeneralSwing()
  animation._captureDefaults(playerObject)
  animation.isRiding = true

  runAnimationFrame(animation, playerObject)

  expectRidingLegPose(playerObject)
})

test('riding applies arm X delta relative to defaults', () => {
  const playerObject = makePlayerObject()
  const defaults = captureRotations(playerObject)
  const animation = new WalkingGeneralSwing()
  animation._captureDefaults(playerObject)
  animation.isRiding = true

  runAnimationFrame(animation, playerObject)

  expect(playerObject.skin.rightArm.rotation.x).toBeCloseTo(defaults.rightArm.x - RIDING_ARM_DELTA)
  expect(playerObject.skin.leftArm.rotation.x).toBeCloseTo(defaults.leftArm.x - RIDING_ARM_DELTA)
})

test('riding does not apply old arm Z spread', () => {
  const playerObject = makePlayerObject()
  const defaults = captureRotations(playerObject)
  const animation = new WalkingGeneralSwing()
  animation._captureDefaults(playerObject)
  animation.isRiding = true

  runAnimationFrame(animation, playerObject)

  expect(playerObject.skin.leftArm.rotation.z).toBeCloseTo(defaults.leftArm.z)
  expect(playerObject.skin.rightArm.rotation.z).toBeCloseTo(defaults.rightArm.z)
})

test('idle to riding to idle restores limb rotations', () => {
  const playerObject = makePlayerObject()
  const animation = new WalkingGeneralSwing()
  animation._captureDefaults(playerObject)
  const defaults = captureRotations(playerObject)

  animation.isMoving = false
  runAnimationFrame(animation, playerObject)
  const idleRotations = captureRotations(playerObject)

  animation.isRiding = true
  runAnimationFrame(animation, playerObject)
  expectRidingLegPose(playerObject)

  animation.isRiding = false
  animation.isMoving = false
  runAnimationFrame(animation, playerObject)
  const restored = captureRotations(playerObject)

  expect(restored.leftArm.x).toBeCloseTo(idleRotations.leftArm.x)
  expect(restored.leftArm.y).toBeCloseTo(idleRotations.leftArm.y)
  expect(restored.leftArm.z).toBeCloseTo(idleRotations.leftArm.z)
  expect(restored.rightArm.x).toBeCloseTo(idleRotations.rightArm.x)
  expect(restored.rightArm.y).toBeCloseTo(idleRotations.rightArm.y)
  expect(restored.rightArm.z).toBeCloseTo(idleRotations.rightArm.z)
  expect(restored.leftLeg.x).toBeCloseTo(defaults.leftLeg.x)
  expect(restored.leftLeg.y).toBeCloseTo(defaults.leftLeg.y)
  expect(restored.leftLeg.z).toBeCloseTo(defaults.leftLeg.z)
  expect(restored.rightLeg.x).toBeCloseTo(defaults.rightLeg.x)
  expect(restored.rightLeg.y).toBeCloseTo(defaults.rightLeg.y)
  expect(restored.rightLeg.z).toBeCloseTo(defaults.rightLeg.z)
})

test('multiple riding frames do not accumulate angles', () => {
  const playerObject = makePlayerObject()
  const animation = new WalkingGeneralSwing()
  animation._captureDefaults(playerObject)
  animation.isRiding = true

  runAnimationFrame(animation, playerObject)
  const firstFrame = captureRotations(playerObject)

  for (let i = 0; i < 10; i++) {
    runAnimationFrame(animation, playerObject)
  }
  const lastFrame = captureRotations(playerObject)

  expect(lastFrame.leftLeg.x).toBeCloseTo(firstFrame.leftLeg.x)
  expect(lastFrame.leftLeg.y).toBeCloseTo(firstFrame.leftLeg.y)
  expect(lastFrame.leftLeg.z).toBeCloseTo(firstFrame.leftLeg.z)
  expect(lastFrame.rightLeg.x).toBeCloseTo(firstFrame.rightLeg.x)
  expect(lastFrame.rightLeg.y).toBeCloseTo(firstFrame.rightLeg.y)
  expect(lastFrame.rightLeg.z).toBeCloseTo(firstFrame.rightLeg.z)
  expect(lastFrame.leftArm.x).toBeCloseTo(firstFrame.leftArm.x)
  expect(lastFrame.rightArm.x).toBeCloseTo(firstFrame.rightArm.x)
})

test('oneSwing during riding keeps isRiding enabled', () => {
  const playerObject = makePlayerObject()
  const animation = new WalkingGeneralSwing()
  animation._captureDefaults(playerObject)
  animation.isRiding = true

  animation.swingArm()
  runAnimationFrame(animation, playerObject)

  expect(animation.isRiding).toBe(true)
})

test('oneSwing during riding keeps legs in riding pose', () => {
  const playerObject = makePlayerObject()
  const animation = new WalkingGeneralSwing()
  animation._captureDefaults(playerObject)
  animation.isRiding = true

  animation.swingArm()
  runAnimationFrame(animation, playerObject)

  expectRidingLegPose(playerObject)
})

test('leg armor attached to legs follows riding Y/Z rotations', () => {
  const playerObject = makePlayerObject()
  const leftLegArmor = new THREE.Group()
  const rightLegArmor = new THREE.Group()
  playerObject.skin.leftLeg.add(leftLegArmor)
  playerObject.skin.rightLeg.add(rightLegArmor)

  const animation = new WalkingGeneralSwing()
  animation._captureDefaults(playerObject)
  animation.isRiding = true
  runAnimationFrame(animation, playerObject)

  expectRidingLegPose(playerObject)

  leftLegArmor.updateMatrixWorld(true)
  rightLegArmor.updateMatrixWorld(true)
  const leftWorldQuat = new THREE.Quaternion()
  const rightWorldQuat = new THREE.Quaternion()
  leftLegArmor.getWorldQuaternion(leftWorldQuat)
  rightLegArmor.getWorldQuaternion(rightWorldQuat)
  const leftWorldEuler = new THREE.Euler().setFromQuaternion(leftWorldQuat, 'XYZ')
  const rightWorldEuler = new THREE.Euler().setFromQuaternion(rightWorldQuat, 'XYZ')

  expect(leftWorldEuler.y).not.toBeCloseTo(0)
  expect(leftWorldEuler.z).not.toBeCloseTo(0)
  expect(rightWorldEuler.y).not.toBeCloseTo(0)
  expect(rightWorldEuler.z).not.toBeCloseTo(0)
})
