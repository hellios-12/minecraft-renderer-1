import * as THREE from 'three'
import { LineMaterial, LineSegmentsGeometry, Wireframe } from 'three-stdlib'
import { WorldRendererThree } from '../worldRendererThree'

const YELLOW: readonly [number, number, number, number] = [1, 1, 0, 1]
const TEAL: readonly [number, number, number, number] = [0, 155 / 255, 155 / 255, 1]
const RED: readonly [number, number, number, number] = [1, 0, 0, 0.5]

const RED_GRID_OFFSETS = [-16, 0, 16, 32] as const
const WALL_OFFSETS = [2, 4, 6, 8, 10, 12, 14] as const
const CORNERS = [0, 16] as const

function pushSegment(
  pos: number[],
  col: number[],
  color: readonly [number, number, number, number],
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number
) {
  pos.push(x1, y1, z1, x2, y2, z2)
  col.push(...color, ...color)
}

function wallColor(offset: number): readonly [number, number, number, number] {
  return offset % 4 === 0 ? TEAL : YELLOW
}

function ringColor(y: number): readonly [number, number, number, number] {
  return y % 8 === 0 ? TEAL : YELLOW
}

export class ChunkBorders {
  private visible = false
  private readonly thinMaterial: THREE.LineBasicMaterial
  private readonly thickMaterial: LineMaterial
  private thinLines: THREE.LineSegments
  private thickLines: Wireframe | null = null
  private chunkMinX = 0
  private chunkMinZ = 0

  constructor(public readonly worldRenderer: WorldRendererThree) {
    this.thinMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthTest: true,
      depthWrite: false
    })
    this.thickMaterial = this.createThickMaterial()
    this.thinLines = new THREE.LineSegments(new THREE.BufferGeometry(), this.thinMaterial)
    this.thinLines.renderOrder = 999
    this.thinLines.visible = false
    this.thinLines.frustumCulled = false
    this.worldRenderer.sceneOrigin.addAndTrack(this.thinLines)
  }

  private createThickMaterial(): LineMaterial {
    const pixelRatio = this.worldRenderer.renderer.getPixelRatio()
    return new LineMaterial({
      color: 0x40_40_ff,
      linewidth: Math.max(pixelRatio * 0.7, 1) * 2,
      transparent: true,
      depthTest: true,
      depthWrite: false
    })
  }

  private getWorldYBounds(): { worldMinY: number; worldMaxY: number } {
    const worldMinY = this.worldRenderer.worldMinYRender
    const worldMaxY = worldMinY + this.worldRenderer.worldSizeParams.worldHeight
    return { worldMinY, worldMaxY }
  }

  private getChunkMinCorner(): { chunkMinX: number; chunkMinZ: number } {
    const { x, z } = this.worldRenderer.cameraWorldPos
    return {
      chunkMinX: Math.floor(x / 16) * 16,
      chunkMinZ: Math.floor(z / 16) * 16
    }
  }

  build(): void {
    const { worldMinY, worldMaxY } = this.getWorldYBounds()
    const { chunkMinX, chunkMinZ } = this.getChunkMinCorner()
    this.chunkMinX = chunkMinX
    this.chunkMinZ = chunkMinZ

    const thinPos: number[] = []
    const thinCol: number[] = []

    for (const xOff of RED_GRID_OFFSETS) {
      for (const zOff of RED_GRID_OFFSETS) {
        pushSegment(thinPos, thinCol, RED, xOff, worldMinY, zOff, xOff, worldMaxY, zOff)
      }
    }

    for (const off of WALL_OFFSETS) {
      const color = wallColor(off)
      pushSegment(thinPos, thinCol, color, 0, worldMinY, off, 0, worldMaxY, off)
      pushSegment(thinPos, thinCol, color, 16, worldMinY, off, 16, worldMaxY, off)
      pushSegment(thinPos, thinCol, color, off, worldMinY, 0, off, worldMaxY, 0)
      pushSegment(thinPos, thinCol, color, off, worldMinY, 16, off, worldMaxY, 16)
    }

    for (let y = worldMinY; y < worldMaxY; y += 2) {
      const color = ringColor(y)
      pushSegment(thinPos, thinCol, color, 0, y, 0, 16, y, 0)
      pushSegment(thinPos, thinCol, color, 16, y, 0, 16, y, 16)
      pushSegment(thinPos, thinCol, color, 16, y, 16, 0, y, 16)
      pushSegment(thinPos, thinCol, color, 0, y, 16, 0, y, 0)
    }

    this.thinLines.geometry.dispose()
    const thinGeometry = new THREE.BufferGeometry()
    thinGeometry.setAttribute('position', new THREE.Float32BufferAttribute(thinPos, 3))
    thinGeometry.setAttribute('color', new THREE.Float32BufferAttribute(thinCol, 4))
    this.thinLines.geometry = thinGeometry
    this.thinLines.position.set(chunkMinX, 0, chunkMinZ)

    const thickPos: number[] = []
    for (const x of CORNERS) {
      for (const z of CORNERS) {
        thickPos.push(x, worldMinY, z, x, worldMaxY, z)
      }
    }
    for (let y = worldMinY; y < worldMaxY; y += 16) {
      thickPos.push(0, y, 0, 16, y, 0)
      thickPos.push(16, y, 0, 16, y, 16)
      thickPos.push(16, y, 16, 0, y, 16)
      thickPos.push(0, y, 16, 0, y, 0)
    }

    if (this.thickLines) {
      this.worldRenderer.sceneOrigin.removeAndUntrack(this.thickLines)
      this.thickLines.geometry.dispose()
      this.thickLines = null
    }

    const thickGeometry = new LineSegmentsGeometry()
    thickGeometry.setPositions(thickPos)
    const wireframe = new Wireframe(thickGeometry, this.thickMaterial)
    wireframe.renderOrder = 999
    wireframe.frustumCulled = false
    wireframe.computeLineDistances()
    this.worldRenderer.sceneOrigin.addAndTrack(wireframe)
    wireframe.position.set(chunkMinX, 0, chunkMinZ)
    this.thickLines = wireframe
  }

  setVisible(value: boolean): void {
    if (value && !this.visible) {
      this.build()
    }
    this.visible = value
    this.thinLines.visible = value
    if (this.thickLines) {
      this.thickLines.visible = value
    }
  }

  render(): void {
    if (!this.visible) return
    const { chunkMinX, chunkMinZ } = this.getChunkMinCorner()
    if (chunkMinX !== this.chunkMinX || chunkMinZ !== this.chunkMinZ) {
      this.build()
    }
    const { renderer } = this.worldRenderer
    this.thickMaterial.resolution.set(renderer.domElement.width, renderer.domElement.height)
  }

  dispose(): void {
    this.worldRenderer.sceneOrigin.removeAndUntrack(this.thinLines)
    this.thinLines.geometry.dispose()
    this.thinMaterial.dispose()
    if (this.thickLines) {
      this.worldRenderer.sceneOrigin.removeAndUntrack(this.thickLines)
      this.thickLines.geometry.dispose()
      this.thickLines = null
    }
    this.thickMaterial.dispose()
    this.visible = false
  }
}
