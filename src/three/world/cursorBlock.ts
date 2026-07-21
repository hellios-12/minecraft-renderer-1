import * as THREE from 'three'
import { LineMaterial, LineSegmentsGeometry, Wireframe } from 'three-stdlib'
import { Vec3 } from 'vec3'
import { WorldRendererThree } from '../worldRendererThree'
import { loadThreeJsTextureFromUrl } from '../threeJsUtils'
import destroyStage0 from '../../assets/destroy_stage_0.png'
import destroyStage1 from '../../assets/destroy_stage_1.png'
import destroyStage2 from '../../assets/destroy_stage_2.png'
import destroyStage3 from '../../assets/destroy_stage_3.png'
import destroyStage4 from '../../assets/destroy_stage_4.png'
import destroyStage5 from '../../assets/destroy_stage_5.png'
import destroyStage6 from '../../assets/destroy_stage_6.png'
import destroyStage7 from '../../assets/destroy_stage_7.png'
import destroyStage8 from '../../assets/destroy_stage_8.png'
import destroyStage9 from '../../assets/destroy_stage_9.png'
import { BlockShape, BlocksShapes } from '../../playerState/types'

export class CursorBlock {
  _cursorLinesHidden = false
  get cursorLinesHidden() {
    return this._cursorLinesHidden
  }
  set cursorLinesHidden(value: boolean) {
    if (this.interactionLines) {
      this.interactionLines.mesh.visible = !value
    }
    this._cursorLinesHidden = value
  }

  cursorLineMaterial!: LineMaterial
  interactionLines: null | { blockPos: Vec3; mesh: THREE.Group; shapePositions: BlocksShapes | undefined } = null
  prevColor: string | undefined
  blockBreakMesh: THREE.Mesh
  breakTextures: THREE.Texture[] = []

  constructor(public readonly worldRenderer: WorldRendererThree) {
    // Initialize break mesh and textures
    const destroyStagesImages = [
      destroyStage0,
      destroyStage1,
      destroyStage2,
      destroyStage3,
      destroyStage4,
      destroyStage5,
      destroyStage6,
      destroyStage7,
      destroyStage8,
      destroyStage9
    ]

    for (let i = 0; i < 10; i++) {
      void loadThreeJsTextureFromUrl(destroyStagesImages[i]).then(texture => {
        texture.magFilter = THREE.NearestFilter
        texture.minFilter = THREE.NearestFilter
        this.breakTextures.push(texture)
      })
    }

    const breakMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      blending: THREE.MultiplyBlending,
      premultipliedAlpha: true,
      alphaTest: 0.5
    })
    this.blockBreakMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), breakMaterial)
    this.blockBreakMesh.visible = false
    this.blockBreakMesh.renderOrder = 999
    this.blockBreakMesh.name = 'blockBreakMesh'
    this.worldRenderer.sceneOrigin.addAndTrack(this.blockBreakMesh)

    this.worldRenderer.onReactivePlayerStateUpdated('gameMode', () => {
      this.updateLineMaterial()
    })
    // todo figure out why otherwise fog from skybox breaks it
    setTimeout(() => {
      this.updateLineMaterial()
      if (this.interactionLines) {
        this.setHighlightCursorBlock(this.interactionLines.blockPos, this.interactionLines.shapePositions, true)
      }
    })
  }

  // Update functions
  updateLineMaterial() {
    const inCreative = this.worldRenderer.playerStateReactive.gameMode === 'creative'
    const pixelRatio = this.worldRenderer.renderer.getPixelRatio()

    if (this.cursorLineMaterial) {
      this.cursorLineMaterial.dispose()
    }
    this.cursorLineMaterial = new LineMaterial({
      color: (() => {
        switch (this.worldRenderer.worldRendererConfig.highlightBlockColor) {
          case 'blue':
            return 0x40_80_ff
          case 'classic':
            return 0x00_00_00
          default:
            return inCreative ? 0x40_80_ff : 0x00_00_00
        }
      })(),
      linewidth: Math.max(pixelRatio * 0.7, 1) * 2
      // dashed: true,
      // dashSize: 5,
    })
    this.prevColor = this.worldRenderer.worldRendererConfig.highlightBlockColor
  }

  updateBreakAnimation(blockPosition: { x: number; y: number; z: number } | undefined, stage: number | null, mergedShape?: BlockShape) {
    this.hideBreakAnimation()
    if (stage === null || !blockPosition || !mergedShape) return

    const { position: _position, width, height, depth } = mergedShape
    const position = new Vec3(_position.x, _position.y, _position.z)
    this.blockBreakMesh.scale.set(width * 1.001, height * 1.001, depth * 1.001)
    position.add(new Vec3(blockPosition.x, blockPosition.y, blockPosition.z))
    this.blockBreakMesh.position.set(position.x, position.y, position.z)
    this.blockBreakMesh.visible = true
    ;(this.blockBreakMesh.material as THREE.MeshBasicMaterial).map = this.breakTextures[stage] ?? this.breakTextures.at(-1)
    ;(this.blockBreakMesh.material as THREE.MeshBasicMaterial).needsUpdate = true
  }

  hideBreakAnimation() {
    if (this.blockBreakMesh) {
      this.blockBreakMesh.visible = false
    }
  }

  updateDisplay() {
    if (this.cursorLineMaterial) {
      const { renderer } = this.worldRenderer
      this.cursorLineMaterial.resolution.set(renderer.domElement.width, renderer.domElement.height)
      this.cursorLineMaterial.dashOffset = performance.now() / 750
    }
  }

  /**
   * Check if a block should be visible (not occluded by terrain between it and camera)
   */
  private isBlockOccluded(blockPos: Vec3, shape: BlockShape): boolean {
    const cameraPos = this.worldRenderer.getCameraPosition()
    const blockCenterPos = new Vec3(
      blockPos.x + shape.position.x + shape.width / 2,
      blockPos.y + shape.position.y + shape.height / 2,
      blockPos.z + shape.position.z + shape.depth / 2
    )

    const direction = blockCenterPos.clone().subtract(cameraPos)
    const distance = direction.length()

    // Use raycaster to check if there's an occluding block between camera and target
    const raycaster = new THREE.Raycaster()
    const rayDirection = new THREE.Vector3(direction.x, direction.y, direction.z).normalize()
    raycaster.ray.origin.set(cameraPos.x, cameraPos.y, cameraPos.z)
    raycaster.ray.direction.copy(rayDirection)

    // Check intersections with terrain chunks
    const intersects = raycaster.intersectObjects(this.worldRenderer.scene.children, true)

    // If there's an intersection closer than our target block, it's occluded
    if (intersects.length > 0) {
      const firstIntersection = intersects[0]
      if (firstIntersection.distance < distance - 0.1) {
        return true
      }
    }

    return false
  }

  setHighlightCursorBlock(blockPos: Vec3 | null, shapePositions?: BlocksShapes, force = false): void {
    if (
      blockPos &&
      this.interactionLines &&
      blockPos.equals(this.interactionLines.blockPos) &&
      sameArray(shapePositions ?? [], this.interactionLines.shapePositions ?? []) &&
      !force
    ) {
      return
    }
    if (this.interactionLines !== null) {
      this.worldRenderer.sceneOrigin.removeAndUntrack(this.interactionLines.mesh)
      this.interactionLines = null
    }
    if (blockPos === null) {
      return
    }

    const group = new THREE.Group()
    for (const { position: _position, width, height, depth } of shapePositions ?? []) {
      // FIX: Skip rendering shapes that are occluded by terrain
      if (this.isBlockOccluded(blockPos, { position: _position, width, height, depth })) {
        continue
      }

      const position = new Vec3(_position.x, _position.y, _position.z)
      const scale = [1.0001 * width, 1.0001 * height, 1.0001 * depth] as const
      const geometry = new THREE.BoxGeometry(...scale)
      const lines = new LineSegmentsGeometry().fromEdgesGeometry(new THREE.EdgesGeometry(geometry))
      const wireframe = new Wireframe(lines, this.cursorLineMaterial)
      wireframe.position.set(position.x, position.y, position.z)
      wireframe.computeLineDistances()
      group.add(wireframe)
    }
    this.worldRenderer.sceneOrigin.addAndTrack(group)
    group.position.set(blockPos.x, blockPos.y, blockPos.z)
    group.visible = !this.cursorLinesHidden
    this.interactionLines = { blockPos, mesh: group, shapePositions }
  }

  render() {
    if (this.prevColor !== this.worldRenderer.worldRendererConfig.highlightBlockColor) {
      this.updateLineMaterial()
    }
    this.updateDisplay()
  }
}

const sameArray = (a: any[], b: any[]) => {
  if (a.length !== b.length) return false
  for (const [i, element] of a.entries()) {
    if (element !== b[i]) return false
  }
  return true
}
