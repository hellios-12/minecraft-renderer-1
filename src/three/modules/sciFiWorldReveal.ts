import * as THREE from 'three'
import type { WorldRendererThree } from '../worldRendererThree'
import type { RendererModuleController, RendererModuleManifest } from '../rendererModuleSystem'
import type { MesherGeometryOutput } from '../../mesher/shared'

const SCI_FI_CYAN = new THREE.Color(13 / 255, 234 / 255, 238 / 255)
const CHUNKS_THRESHOLD = 9
const REVEAL_DURATION = 3500 // ms for full reveal transition
const WIREFRAME_FADE_DELAY = 1200 // ms before wireframe starts fading

const INITIAL_WIREFRAME_MS = 350
const INITIAL_REVEAL_MS = 650
const INITIAL_WAVE_SPREAD_MS = 650

const CHUNK_WIREFRAME_MS = 120
const CHUNK_REVEAL_MS = 280

const MAX_CONCURRENT_REVEALS = 20

interface RevealingSection {
  key: string
  wireframeGroup: THREE.Group
  revealStartTime: number
  phase: 'wireframe' | 'transitioning' | 'complete'
  originalMeshRef: THREE.Mesh | null
  wireframeMs: number
  revealMs: number
}


/**
 * SciFiWorldReveal - Creates a futuristic wireframe-to-solid reveal effect
 *
 * When chunks load, they first appear as glowing cyan wireframes that pulse
 * and emanate from the camera, then gradually transition to solid geometry.
 */
export class SciFiWorldRevealModule implements RendererModuleController {
  private readonly pendingGeometries = new Map<string, MesherGeometryOutput>()
  private readonly revealingSections = new Map<string, RevealingSection>()
  private finishedChunkCount = 0
  private revealTriggered = false
  private revealStartTime = 0
  private enabled = false

  private onWorldSwitchedCb: (() => void) | null = null
  private patched = false
  private initialWaveDone = false

  // Wireframe materials
  private readonly wireframeMaterial!: THREE.LineBasicMaterial
  private readonly wireframeGlowMaterial!: THREE.LineBasicMaterial

  // For pulsing animation
  private pulseTime = 0

  // Track which chunks have been revealed
  private readonly revealedChunks = new Set<string>()

  // Queue for sections that exceed the concurrent cap
  private readonly pendingRevealQueue: Array<{ key: string; geometry: MesherGeometryOutput }> = []

  // Frame counter for update throttling
  private updateFrameCounter = 0

  // Perf instrumentation (accumulators)
  private perfStats = {
    wireframeCalls: 0,
    wireframeTotalMs: 0,
    wireframeMaxMs: 0,
    wireframeSlowCalls: 0, // calls > 2ms
    updateCalls: 0,
    updateTotalMs: 0,
    updateMaxMs: 0,
    updateSlowCalls: 0, // calls > 1ms
    maxConcurrentSeen: 0,
    queueOverflows: 0,
    phaseWireframeTotalMs: 0,
    phaseTransitioningTotalMs: 0,
    phaseTransitionEvents: 0,
    cloneCalls: 0,
    cloneTotalMs: 0,
    cloneMaxMs: 0,
  }
  private perfWarnThresholdWireframeMs = 2
  private perfWarnThresholdUpdateMs = 1
  private perfWarnThresholdCloneMs = 5
  private perfWarnEnabled = true

  // Store original methods for patching
  private originalFinishChunk: ((chunkKey: string) => void) | null = null
  private originalDestroy: (() => void) | null = null
  private originalSceneAdd: ((...object: THREE.Object3D[]) => THREE.Scene) | null = null
  private originalHandleWorkerMessage: ((data: { geometry: MesherGeometryOutput; key: string; type: string }) => void) | null = null

  constructor(private readonly worldRenderer: WorldRendererThree) {
    this.wireframeMaterial = new THREE.LineBasicMaterial({
      color: SCI_FI_CYAN,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })

    this.wireframeGlowMaterial = new THREE.LineBasicMaterial({
      color: SCI_FI_CYAN,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  }

  enable(): void {
    if (!this.worldRenderer.worldRendererConfig.futuristicReveal) return
    if (this.enabled) return
    this.enabled = true
    this.patchWorldRenderer()
  }

  disable(): void {
    if (!this.enabled) return
    this.enabled = false
    this.unpatchWorldRenderer()
    this.reset()
  }

  toggle(): boolean {
    if (this.enabled) {
      this.disable()
    } else {
      this.enable()
    }
    return this.enabled
  }

  autoEnableCheck(): boolean {
    return this.worldRenderer.worldRendererConfig.futuristicReveal === true
  }

  render?: (deltaTime: number) => void = (deltaTime) => {
    if (!this.enabled) return
    this.update(deltaTime * 1000)
  }

  dispose(): void {
    this.disable()
    this.wireframeMaterial.dispose()
    this.wireframeGlowMaterial.dispose()
  }

  /**
   * Patch world renderer methods to integrate the reveal effect
   */
  private patchWorldRenderer(): void {
    if (this.patched) return
    this.patched = true
    const wr = this.worldRenderer

    // Hook into onWorldSwitched
    this.onWorldSwitchedCb = () => this.reset()
    wr.onWorldSwitched.push(this.onWorldSwitchedCb)


    // Patch finishChunk
    this.originalFinishChunk = wr.finishChunk.bind(wr)
    wr.finishChunk = (chunkKey: string) => {
      this.originalFinishChunk!(chunkKey)
      this.onChunkFinished(chunkKey)
    }

    // Patch destroy
    this.originalDestroy = wr.destroy.bind(wr)
    wr.destroy = () => {
      this.dispose()
      this.originalDestroy!()
    }

    // Patch handleWorkerMessage to intercept geometry
    this.originalHandleWorkerMessage = wr.handleWorkerMessage.bind(wr)
    wr.handleWorkerMessage = (data: any) => {
      this.originalHandleWorkerMessage!(data)

      if (this.enabled && data?.type === 'geometry' && data?.geometry?.positions?.length) {
        try {
          this.registerSection(data.key, data.geometry)
        } catch (err) {
          console.error('[SciFiReveal] registerSection failed', err)
        }
      }
    }


    // Patch scene.add to intercept mesh additions
    this.originalSceneAdd = wr.scene.add.bind(wr.scene)
    wr.scene.add = (...objects: THREE.Object3D[]): THREE.Scene => {
      const result = this.originalSceneAdd!(...objects)

      if (this.revealingSections.size === 0 && this.pendingGeometries.size === 0) return result

      for (const obj of objects) {
        this.checkAndPatchMesh(obj)
      }

      return result
    }
  }

  /**
   * Unpatch world renderer methods
   */
  private unpatchWorldRenderer(): void {
    const wr = this.worldRenderer

    if (this.originalFinishChunk) {
      wr.finishChunk = this.originalFinishChunk
      this.originalFinishChunk = null
    }

    if (this.originalDestroy) {
      wr.destroy = this.originalDestroy
      this.originalDestroy = null
    }

    if (this.originalHandleWorkerMessage) {
      wr.handleWorkerMessage = this.originalHandleWorkerMessage
      this.originalHandleWorkerMessage = null
    }

    if (this.originalSceneAdd) {
      wr.scene.add = this.originalSceneAdd
      this.originalSceneAdd = null
    }

    if (this.onWorldSwitchedCb) {
      const i = wr.onWorldSwitched.indexOf(this.onWorldSwitchedCb)
      if (i !== -1) wr.onWorldSwitched.splice(i, 1)
      this.onWorldSwitchedCb = null
    }
    this.patched = false
  }

  /**
   * Check if an object or its children is a mesh that needs reveal effect visibility patch
   */
  private checkAndPatchMesh(obj: THREE.Object3D): void {
    // Check if this is a mesh with name === 'mesh'
    if (obj instanceof THREE.Mesh && obj.name === 'mesh') {
      const sectionKey = this.findSectionKeyForMesh(obj)
      if (sectionKey && this.shouldUseRevealEffect(sectionKey)) {
        obj.visible = false
          ; (obj as any).hiddenByReveal = true
      }
    }

    // Recursively check children
    for (const child of obj.children) {
      this.checkAndPatchMesh(child)
    }
  }

  /**
   * Find the section key for a mesh by traversing up to find the parent group
   * and checking for sectionKey property
   */
  private findSectionKeyForMesh(mesh: THREE.Mesh): string | null {
    // Traverse up to find the parent group with sectionKey
    let current: THREE.Object3D | null = mesh
    while (current) {
      const { sectionKey } = (current as any)
      if (sectionKey && this.worldRenderer.chunkMeshManager.sectionObjects[sectionKey] === current) {
        return sectionKey
      }
      current = current.parent
    }

    // Fallback: try to derive key from mesh world position
    // mesh.position is scene-relative (near 0 in camera-relative rendering),
    // so use stored world coords or convert back to world coords
    const wp = this.worldRenderer.sceneOrigin.getWorldPosition(mesh)
    const worldX = wp?.x ?? this.worldRenderer.sceneOrigin.toWorldX(mesh.position.x)
    const worldY = wp?.y ?? this.worldRenderer.sceneOrigin.toWorldY(mesh.position.y)
    const worldZ = wp?.z ?? this.worldRenderer.sceneOrigin.toWorldZ(mesh.position.z)
    const CHUNK_SIZE = 16
    const sectionHeight = this.worldRenderer.getSectionHeight()
    const sectionX = Math.floor(worldX / CHUNK_SIZE) * CHUNK_SIZE
    const sectionY = Math.floor(worldY / sectionHeight) * sectionHeight
    const sectionZ = Math.floor(worldZ / CHUNK_SIZE) * CHUNK_SIZE
    const derivedKey = `${sectionX},${sectionY},${sectionZ}`

    // Verify this key exists in sectionObjects
    if (this.worldRenderer.chunkMeshManager.sectionObjects[derivedKey]) {
      return derivedKey
    }

    return null
  }

  /**
   * Get the scene from world renderer
   */
  private get scene(): THREE.Scene {
    return this.worldRenderer.realScene
  }

  /**
   * Get camera position from world renderer
   */
  private getCameraPosition(): THREE.Vector3 {
    return this.worldRenderer.getCameraPosition()
  }

  /**
   * Get original mesh for a section key
   */
  private getOriginalMesh(key: string): THREE.Mesh | null {
    const sectionObject = this.worldRenderer.chunkMeshManager.sectionObjects[key]
    if (!sectionObject) return null
    return sectionObject.children.find(child => child.name === 'mesh') as THREE.Mesh | null
  }

  /**
   * Call this when a chunk finishes loading
   */
  onChunkFinished(_chunkKey: string): void {
    this.finishedChunkCount++

    if (!this.revealTriggered && this.finishedChunkCount >= CHUNKS_THRESHOLD) {
      this.triggerReveal()
    }
  }

  /**
   * Register a new section geometry for the reveal effect
   */
  registerSection(key: string, geometry: MesherGeometryOutput): void {
    // If already revealed or currently revealing, skip
    if (this.revealedChunks.has(key) || this.revealingSections.has(key)) return

    // If reveal already triggered, start effect immediately (don't store in pending)
    if (this.revealTriggered) {
      this.startSectionReveal(key, geometry)
    } else {
      // Store geometry for later
      this.pendingGeometries.set(key, geometry)
    }
  }

  /**
   * Check if a section should use the reveal effect
   */
  shouldUseRevealEffect(key: string): boolean {
    return this.enabled && !this.revealedChunks.has(key) && !this.revealingSections.has(key)
  }

  /**
   * Trigger the reveal sequence
   */
  private triggerReveal(): void {
    this.revealTriggered = true
    this.initialWaveDone = true

    this.revealStartTime = performance.now()

    const cameraPos = this.getCameraPosition()

    // Copy and clear pending geometries before processing
    const toProcess = [...this.pendingGeometries.entries()]
    this.pendingGeometries.clear()

    // Sort by distance from camera for wave effect
    const sorted = toProcess
      .map(([key, geometry]) => {
        const distance = Math.hypot(
          (geometry.sx - cameraPos.x),
          (geometry.sy - cameraPos.y),
          (geometry.sz - cameraPos.z)
        )
        return { key, geometry, distance }
      })
      .sort((a, b) => a.distance - b.distance)

    const maxDistance = sorted.at(-1)?.distance || 1

    // Start reveal for each section with staggered timing
    for (const { key, geometry, distance } of sorted) {
      const delay = (distance / maxDistance) * 1500 // 1500ms spread for wave effect
      setTimeout(() => {
        // Double check the section hasn't been revealed already
        if (!this.revealedChunks.has(key) && !this.revealingSections.has(key)) {
          this.startSectionReveal(key, geometry)
        }
      }, delay)
    }
  }

  /**
   * Start the reveal effect for a single section
   */
  private startSectionReveal(key: string, geometry: MesherGeometryOutput): void {
    if (!geometry.positions?.length) return

    if (this.revealingSections.has(key) || this.revealedChunks.has(key)) return

    if (this.revealingSections.size >= MAX_CONCURRENT_REVEALS) {
      this.pendingRevealQueue.push({ key, geometry })
      this.perfStats.queueOverflows++
      return
    }

    // Create wireframe geometry
    const wireframeGeom = this.createWireframeGeometry(geometry)

    const original = this.getOriginalMesh(key)
    if (original) {
      original.visible = false
        ; (original as any).hiddenByReveal = true
    }
    // Main wireframe
    const wireframe = new THREE.LineSegments(wireframeGeom, this.wireframeMaterial.clone())
    this.worldRenderer.sceneOrigin.track(wireframe)
    wireframe.position.set(geometry.sx, geometry.sy, geometry.sz)
    wireframe.name = 'scifi-wireframe'
    wireframe.renderOrder = 1000

    // Glow layer
    const glowWireframe = new THREE.LineSegments(wireframeGeom.clone(), this.wireframeGlowMaterial.clone())
    this.worldRenderer.sceneOrigin.track(glowWireframe)
    glowWireframe.position.set(geometry.sx, geometry.sy, geometry.sz)
    glowWireframe.scale.set(1.02, 1.02, 1.02)
    glowWireframe.name = 'scifi-glow'
    glowWireframe.renderOrder = 999

    const group = new THREE.Group()
    group.add(wireframe)
    group.add(glowWireframe)
    group.name = 'scifi-reveal-group'
      // Store key on group for debugging
      ; (group as any).sectionKey = key

    this.scene.add(group)

    const wireframeMs = this.initialWaveDone ? CHUNK_WIREFRAME_MS : INITIAL_WIREFRAME_MS
    const revealMs = this.initialWaveDone ? CHUNK_REVEAL_MS : INITIAL_REVEAL_MS

    const section: RevealingSection = {
      key,
      wireframeGroup: group,
      revealStartTime: performance.now(),
      phase: 'wireframe',
      originalMeshRef: null,
      wireframeMs,
      revealMs,
    }

    setTimeout(() => {
      const m = this.getOriginalMesh(key)
      if (m && !(m as any).hiddenByReveal) {
        m.visible = false
          ; (m as any).hiddenByReveal = true
      }
    }, 0)

    this.revealingSections.set(key, section)
  }

  private createWireframeGeometry(geometry: MesherGeometryOutput): THREE.BufferGeometry {
    const t0 = performance.now()
    const positions = geometry.positions as Float32Array
    const indices = geometry.indices as Uint32Array | Uint16Array

    const tempGeom = new THREE.BufferGeometry()
    tempGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    tempGeom.setIndex(new THREE.BufferAttribute(indices, 1))

    const wireframeGeom = new THREE.EdgesGeometry(tempGeom, 0)

    tempGeom.dispose()

    const elapsed = performance.now() - t0
    this.perfStats.wireframeCalls++
    this.perfStats.wireframeTotalMs += elapsed
    if (elapsed > this.perfStats.wireframeMaxMs) this.perfStats.wireframeMaxMs = elapsed
    if (elapsed > this.perfWarnThresholdWireframeMs) {
      this.perfStats.wireframeSlowCalls++
      if (this.perfWarnEnabled) {
        console.warn(`[SciFiReveal] createWireframeGeometry took ${elapsed.toFixed(2)}ms (positions=${positions.length / 3}, tris=${indices.length / 3})`)
      }
    }

    return wireframeGeom
  }

  /**
   * Update the reveal animation - call this every frame
   */
  update(deltaTime: number): void {
    if (!this.enabled) return
    if (this.revealingSections.size === 0 && this.pendingRevealQueue.length === 0) return

    this.pulseTime += deltaTime * 0.001 // Convert to seconds

    this.updateFrameCounter++
    if (this.updateFrameCounter % 2 !== 0) return

    // Pump queue at frame start in case revealingSections drained while queue still has items
    if (this.revealingSections.size === 0 && this.pendingRevealQueue.length > 0) {
      this.dequeueNextReveal()
    }

    if (this.revealingSections.size === 0) return

    const t0 = performance.now()
    const currentTime = t0
    const sectionsCount = this.revealingSections.size
    if (sectionsCount > this.perfStats.maxConcurrentSeen) {
      this.perfStats.maxConcurrentSeen = sectionsCount
    }

    // Pulse effect parameters
    const basePulse = 0.6 + 0.4 * Math.sin(this.pulseTime * 4)

    const toComplete: RevealingSection[] = []

    // Sub-phase timing accumulators (per update() call)
    let phaseWireframeMs = 0
    let phaseTransitioningMs = 0
    let cloneMs = 0
    let cloneCount = 0
    let phaseTransitions = 0
    let completeMs = 0
    let dequeueWireframeCalls = 0
    const wireframeBefore = this.perfStats.wireframeCalls

    for (const [key, section] of this.revealingSections) {
      const elapsed = currentTime - section.revealStartTime

      if (section.phase === 'wireframe') {
        const wf0 = performance.now()
        // Animate wireframe
        const wireframe = section.wireframeGroup.children[0] as THREE.LineSegments
        const glow = section.wireframeGroup.children[1] as THREE.LineSegments

        if (wireframe?.material) {
          const mat = wireframe.material as THREE.LineBasicMaterial
          mat.opacity = basePulse

          // Color pulse with slight variation
          const colorIntensity = 0.85 + 0.15 * Math.sin(this.pulseTime * 6 + elapsed * 0.002)
          mat.color.setRGB(
            (13 / 255) * colorIntensity,
            (234 / 255) * colorIntensity,
            (238 / 255) * colorIntensity
          )
        }

        if (glow?.material) {
          const glowMat = glow.material as THREE.LineBasicMaterial
          glowMat.opacity = basePulse * 0.4
        }

        // Transition to fading phase
        if (elapsed > section.wireframeMs) {
          section.phase = 'transitioning'
          phaseTransitions++

          // Get and show the original mesh with fade-in
          section.originalMeshRef = this.getOriginalMesh(key)
          if (section.originalMeshRef) {
            section.originalMeshRef.visible = true
            // Store original material and create fade version
            const originalMat = section.originalMeshRef.material as THREE.MeshLambertMaterial
            const c0 = performance.now()
            const fadeMat = originalMat.clone()
            fadeMat.transparent = true
            fadeMat.opacity = 0
            fadeMat.needsUpdate = true
            const cElapsed = performance.now() - c0
            cloneMs += cElapsed
            cloneCount++
            this.perfStats.cloneCalls++
            this.perfStats.cloneTotalMs += cElapsed
            if (cElapsed > this.perfStats.cloneMaxMs) this.perfStats.cloneMaxMs = cElapsed
            if (cElapsed > this.perfWarnThresholdCloneMs && this.perfWarnEnabled) {
              console.warn(`[SciFiReveal] material.clone+needsUpdate took ${cElapsed.toFixed(2)}ms`)
            }
              ; (section.originalMeshRef as any).originalMaterial = originalMat
            section.originalMeshRef.material = fadeMat
          }
        }
        phaseWireframeMs += performance.now() - wf0
      } else if (section.phase === 'transitioning') {
        const tr0 = performance.now()
        const transitionElapsed = elapsed - section.wireframeMs
        const progress = Math.min(1, transitionElapsed / section.revealMs)

        // Smooth ease-out curve
        const eased = 1 - (1 - progress) ** 3

        // Fade out wireframe
        const wireframe = section.wireframeGroup.children[0] as THREE.LineSegments
        const glow = section.wireframeGroup.children[1] as THREE.LineSegments

        if (wireframe?.material) {
          const mat = wireframe.material as THREE.LineBasicMaterial
          mat.opacity = (1 - eased)
        }

        if (glow?.material) {
          const glowMat = glow.material as THREE.LineBasicMaterial
          glowMat.opacity = (1 - eased) * 0.55
        }

        // Fade in original mesh
        if (section.originalMeshRef?.material) {
          const fadeMat = section.originalMeshRef.material as THREE.MeshLambertMaterial
          fadeMat.opacity = eased
        }

        // Complete transition
        if (progress >= 1) {
          section.phase = 'complete'
          toComplete.push(section)
        }
        phaseTransitioningMs += performance.now() - tr0
      }
    }

    // Complete all finished sections after iteration
    const cmp0 = performance.now()
    for (const section of toComplete) {
      this.completeReveal(section)
    }
    completeMs = performance.now() - cmp0
    // Process queue with per-frame budget AFTER completes (decoupled chain)
    this.dequeueNextReveal()
    dequeueWireframeCalls = this.perfStats.wireframeCalls - wireframeBefore

    const elapsed = performance.now() - t0
    this.perfStats.updateCalls++
    this.perfStats.updateTotalMs += elapsed
    if (elapsed > this.perfStats.updateMaxMs) this.perfStats.updateMaxMs = elapsed
    this.perfStats.phaseWireframeTotalMs += phaseWireframeMs
    this.perfStats.phaseTransitioningTotalMs += phaseTransitioningMs
    this.perfStats.phaseTransitionEvents += phaseTransitions
    if (elapsed > this.perfWarnThresholdUpdateMs) {
      this.perfStats.updateSlowCalls++
      if (this.perfWarnEnabled) {
        console.warn(
          `[SciFiReveal] update took ${elapsed.toFixed(2)}ms for ${sectionsCount} sections | wireframe-phase=${phaseWireframeMs.toFixed(2)}ms transitioning-phase=${phaseTransitioningMs.toFixed(2)}ms clones=${cloneCount}(${cloneMs.toFixed(2)}ms) transitions=${phaseTransitions} completes=${toComplete.length}(${completeMs.toFixed(2)}ms) dequeueWireframes=${dequeueWireframeCalls}`
        )
      }
    }
  }

  /**
   * Complete the reveal and clean up
   */
  private completeReveal(section: RevealingSection): void {
    // Remove from map first to prevent re-processing
    this.revealingSections.delete(section.key)
    this.revealedChunks.add(section.key)

    // Restore original material first
    if (section.originalMeshRef) {
      const originalMat = (section.originalMeshRef as any).originalMaterial
      if (originalMat) {
        const currentMat = section.originalMeshRef.material as THREE.Material
        section.originalMeshRef.material = originalMat
        currentMat.dispose()
        delete (section.originalMeshRef as any).originalMaterial
      }
      section.originalMeshRef.visible = true
      delete (section.originalMeshRef as any).hiddenByReveal
    }

    // Clean up wireframe group
    this.disposeWireframeGroup(section.wireframeGroup)
  }

  // Budget: max wireframes to build per frame to avoid main-thread chaining
  private static readonly DEQUEUE_BUDGET_PER_FRAME = 1

  private dequeueNextReveal(): void {
    let built = 0
    while (
      built < SciFiWorldRevealModule.DEQUEUE_BUDGET_PER_FRAME &&
      this.pendingRevealQueue.length > 0 &&
      this.revealingSections.size < MAX_CONCURRENT_REVEALS
    ) {
      const next = this.pendingRevealQueue.shift()!
      this.startSectionReveal(next.key, next.geometry)
      built++
    }
  }

  /**
   * Dispose a wireframe group and remove from scene
   */
  private disposeWireframeGroup(group: THREE.Group): void {
    this.worldRenderer.sceneOrigin.removeAndUntrackAll(group)

    // Collect all objects to dispose
    const toDispose: THREE.Object3D[] = []
    group.traverse((child) => {
      toDispose.push(child)
    })

    // Dispose all collected objects
    for (const child of toDispose) {
      const lineSegments = child as THREE.LineSegments
      if (lineSegments.geometry) {
        lineSegments.geometry.dispose()
      }
      if (lineSegments.material) {
        const mat = lineSegments.material
        if (Array.isArray(mat)) {
          for (const m of mat) m.dispose()
        } else if (mat && typeof mat.dispose === 'function') {
          mat.dispose()
        }
      }
    }

    // Clear children
    group.clear()
  }

  /**
   * Reset the reveal system
   */
  reset(): void {
    // Clean up all revealing sections
    for (const section of this.revealingSections.values()) {
      this.disposeWireframeGroup(section.wireframeGroup)
    }

    this.pendingGeometries.clear()
    this.revealingSections.clear()
    this.revealedChunks.clear()
    this.pendingRevealQueue.length = 0
    this.finishedChunkCount = 0
    this.revealTriggered = false
    this.revealStartTime = 0
    this.pulseTime = 0
    this.updateFrameCounter = 0
  }

  /**
   * Force complete all reveals (skip animation)
   */
  forceCompleteAll(): void {
    const sections = [...this.revealingSections.values()]
    for (const section of sections) {
      // Show original mesh immediately
      if (!section.originalMeshRef) {
        section.originalMeshRef = this.getOriginalMesh(section.key)
      }
      if (section.originalMeshRef) {
        const originalMat = (section.originalMeshRef as any).originalMaterial
        if (originalMat) {
          section.originalMeshRef.material = originalMat
        }
        section.originalMeshRef.visible = true
      }
      this.completeReveal(section)
    }
  }

  // ============ DEBUG METHODS ============

  /**
   * Debug: Get all wireframe groups still in scene
   */
  debugGetWireframeGroups(): THREE.Group[] {
    const groups: THREE.Group[] = []
    this.scene.traverse((child) => {
      if (child.name === 'scifi-reveal-group') {
        groups.push(child as THREE.Group)
      }
    })
    return groups
  }

  /**
   * Debug: Force remove all wireframe groups from scene
   */
  debugForceCleanup(): void {
    const groups = this.debugGetWireframeGroups()
    console.log(`[SciFiReveal] Found ${groups.length} wireframe groups in scene`)

    for (const group of groups) {
      console.log(`[SciFiReveal] Removing group:`, group)
      this.disposeWireframeGroup(group)
    }

    // Also clean up any tracked sections
    for (const section of this.revealingSections.values()) {
      this.disposeWireframeGroup(section.wireframeGroup)
    }
    this.revealingSections.clear()

    console.log(`[SciFiReveal] Cleanup complete. Remaining groups: ${this.debugGetWireframeGroups().length}`)
  }

  /**
   * Debug: Get status of the reveal system
   */
  debugStatus() {
    const wireframeGroups = this.debugGetWireframeGroups()
    const trackedKeys = new Set(this.revealingSections.keys())
    const orphanedGroups = wireframeGroups.filter(g => !trackedKeys.has((g as any).sectionKey))

    return {
      revealTriggered: this.revealTriggered,
      finishedChunkCount: this.finishedChunkCount,
      pendingGeometries: this.pendingGeometries.size,
      revealingSections: this.revealingSections.size,
      revealedChunks: this.revealedChunks.size,
      wireframeGroupsInScene: wireframeGroups.length,
      orphanedWireframeGroups: orphanedGroups.length,
      orphanedKeys: orphanedGroups.map(g => (g as any).sectionKey),
      sections: [...this.revealingSections.entries()].map(([key, s]) => ({
        key,
        phase: s.phase,
        hasOriginalMesh: !!s.originalMeshRef,
        wireframeInScene: s.wireframeGroup.parent !== null
      })),
      perf: this.debugPerfStats(),
    }
  }

  /**
   * Debug: Log current status to console
   */
  debugLog(): void {
    console.log('[SciFiReveal] Status:', this.debugStatus())
  }

  /**
   * Debug: Computed perf stats (averages + raw accumulators)
   */
  debugPerfStats() {
    const p = this.perfStats
    return {
      wireframe: {
        calls: p.wireframeCalls,
        totalMs: +p.wireframeTotalMs.toFixed(2),
        avgMs: p.wireframeCalls ? +(p.wireframeTotalMs / p.wireframeCalls).toFixed(3) : 0,
        maxMs: +p.wireframeMaxMs.toFixed(2),
        slowCalls: p.wireframeSlowCalls,
        slowThresholdMs: this.perfWarnThresholdWireframeMs,
      },
      update: {
        calls: p.updateCalls,
        totalMs: +p.updateTotalMs.toFixed(2),
        avgMs: p.updateCalls ? +(p.updateTotalMs / p.updateCalls).toFixed(3) : 0,
        maxMs: +p.updateMaxMs.toFixed(2),
        slowCalls: p.updateSlowCalls,
        slowThresholdMs: this.perfWarnThresholdUpdateMs,
      },
      phases: {
        wireframeTotalMs: +p.phaseWireframeTotalMs.toFixed(2),
        transitioningTotalMs: +p.phaseTransitioningTotalMs.toFixed(2),
        transitionEvents: p.phaseTransitionEvents,
      },
      clone: {
        calls: p.cloneCalls,
        totalMs: +p.cloneTotalMs.toFixed(2),
        avgMs: p.cloneCalls ? +(p.cloneTotalMs / p.cloneCalls).toFixed(3) : 0,
        maxMs: +p.cloneMaxMs.toFixed(2),
        slowThresholdMs: this.perfWarnThresholdCloneMs,
      },
      maxConcurrentSeen: p.maxConcurrentSeen,
      queueOverflows: p.queueOverflows,
      pendingQueueSize: this.pendingRevealQueue.length,
      warningsEnabled: this.perfWarnEnabled,
    }
  }

  debugPerfLog(): void {
    console.log('[SciFiReveal] Perf:', this.debugPerfStats())
  }

  debugPerfReset(): void {
    this.perfStats = {
      wireframeCalls: 0,
      wireframeTotalMs: 0,
      wireframeMaxMs: 0,
      wireframeSlowCalls: 0,
      updateCalls: 0,
      updateTotalMs: 0,
      updateMaxMs: 0,
      updateSlowCalls: 0,
      maxConcurrentSeen: 0,
      queueOverflows: 0,
      phaseWireframeTotalMs: 0,
      phaseTransitioningTotalMs: 0,
      phaseTransitionEvents: 0,
      cloneCalls: 0,
      cloneTotalMs: 0,
      cloneMaxMs: 0,
    }
    console.log('[SciFiReveal] Perf stats reset')
  }

  debugPerfWarnings(enabled: boolean): void {
    this.perfWarnEnabled = enabled
    console.log(`[SciFiReveal] Perf warnings ${enabled ? 'enabled' : 'disabled'}`)
  }
}

export const sciFiWorldRevealManifest: RendererModuleManifest = {
  id: 'futuristicReveal',
  controller: SciFiWorldRevealModule,
  enabledDefault: true,
}
