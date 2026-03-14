import type { Object3D, Vector3 } from 'three'

interface TrackOptions {
  updateMatrix?: boolean
}

export class SceneOrigin {
  // World coordinates of origin in float64 (JavaScript number)
  private _x = 0
  private _y = 0
  private _z = 0

  private readonly _tracked = new Set<Object3D>()
  private readonly _worldCoords = new WeakMap<Object3D, { x: number; y: number; z: number }>()
  private readonly _originalPositions = new WeakMap<Object3D, Vector3>()
  private readonly _trackOptions = new WeakMap<Object3D, TrackOptions>()

  get x(): number { return this._x }
  get y(): number { return this._y }
  get z(): number { return this._z }

  /** Update origin (called each frame with camera world position) */
  update(worldX: number, worldY: number, worldZ: number): void {
    this._x = worldX
    this._y = worldY
    this._z = worldZ

    for (const obj of this._tracked) {
      const worldData = this._worldCoords.get(obj)!
      const realPos = this._originalPositions.get(obj)!
      realPos.set(worldData.x - worldX, worldData.y - worldY, worldData.z - worldZ)
      const opts = this._trackOptions.get(obj)
      if (opts?.updateMatrix) obj.updateMatrix()
    }
  }

  /** Track an Object3D so its position is automatically adjusted on origin changes */
  track(obj: Object3D, options?: TrackOptions): void {
    // If already tracked, use the stored original position to avoid nesting Proxies
    const realPosition = this._originalPositions.get(obj) ?? obj.position
    const worldData = { x: 0, y: 0, z: 0 }

    this._originalPositions.set(obj, realPosition)
    this._worldCoords.set(obj, worldData)
    if (options) this._trackOptions.set(obj, options)

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const origin = this
    const opts = options

    const proxy = new Proxy(realPosition, {
      get(target, prop, receiver) {
        if (prop === 'set') {
          return (x: number, y: number, z: number) => {
            worldData.x = x; worldData.y = y; worldData.z = z
            target.set(x - origin._x, y - origin._y, z - origin._z)
            if (opts?.updateMatrix) obj.updateMatrix()
            return receiver
          }
        }
        if (prop === 'copy') {
          return (v: Vector3) => {
            worldData.x = v.x; worldData.y = v.y; worldData.z = v.z
            target.set(v.x - origin._x, v.y - origin._y, v.z - origin._z)
            if (opts?.updateMatrix) obj.updateMatrix()
            return receiver
          }
        }
        if (prop === 'setX') {
          return (val: number) => {
            worldData.x = val; target.x = val - origin._x
            if (opts?.updateMatrix) obj.updateMatrix()
            return receiver
          }
        }
        if (prop === 'setY') {
          return (val: number) => {
            worldData.y = val; target.y = val - origin._y
            if (opts?.updateMatrix) obj.updateMatrix()
            return receiver
          }
        }
        if (prop === 'setZ') {
          return (val: number) => {
            worldData.z = val; target.z = val - origin._z
            if (opts?.updateMatrix) obj.updateMatrix()
            return receiver
          }
        }
        const value = (target as any)[prop]
        if (typeof value === 'function') return value.bind(target)
        return value
      },
      set(target, prop, value) {
        if (prop === 'x') {
          worldData.x = value; target.x = value - origin._x
          if (opts?.updateMatrix) obj.updateMatrix()
          return true
        }
        if (prop === 'y') {
          worldData.y = value; target.y = value - origin._y
          if (opts?.updateMatrix) obj.updateMatrix()
          return true
        }
        if (prop === 'z') {
          worldData.z = value; target.z = value - origin._z
          if (opts?.updateMatrix) obj.updateMatrix()
          return true
        }
        ;(target as any)[prop] = value
        return true
      }
    })

    Object.defineProperty(obj, 'position', { value: proxy, configurable: true, enumerable: true })
    this._tracked.add(obj)
  }

  /** Stop tracking an Object3D, restoring its original position Vector3 */
  untrack(obj: Object3D): void {
    const originalPos = this._originalPositions.get(obj)
    if (!originalPos) return
    Object.defineProperty(obj, 'position', { value: originalPos, configurable: true, enumerable: true })
    this._tracked.delete(obj)
    this._worldCoords.delete(obj)
    this._originalPositions.delete(obj)
    this._trackOptions.delete(obj)
  }

  /** Get stored world position for a tracked object */
  getWorldPosition(obj: Object3D): { x: number; y: number; z: number } | undefined {
    return this._worldCoords.get(obj)
  }

  /** Convert world coordinates → scene coordinates */
  toSceneX(worldX: number): number { return worldX - this._x }
  toSceneY(worldY: number): number { return worldY - this._y }
  toSceneZ(worldZ: number): number { return worldZ - this._z }

  /** Convert scene coordinates → world coordinates */
  toWorldX(sceneX: number): number { return sceneX + this._x }
  toWorldY(sceneY: number): number { return sceneY + this._y }
  toWorldZ(sceneZ: number): number { return sceneZ + this._z }
}
