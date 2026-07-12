import { SectionOcclusionGraph, type OcclusionSectionRecord, type OcclusionUpdateParams } from './sectionOcclusionGraph'
import { VISIBILITY_SET_ALL_TRUE } from '../../mesher-shared/visibilitySet'

export type { OcclusionSectionRecord, OcclusionUpdateParams }

export class SectionOcclusionCull {
  private readonly graph = new SectionOcclusionGraph()
  private readonly registered = new Set<string>()
  private lastVisible = new Set<string>()

  registerSection(key: string, visibilitySet: number | undefined, worldX: number, worldY: number, worldZ: number): void {
    this.registered.add(key)
    this.graph.registerSection(key, {
      visibilitySet: visibilitySet ?? VISIBILITY_SET_ALL_TRUE,
      worldX,
      worldY,
      worldZ
    })
  }

  unregisterSection(key: string): void {
    this.registered.delete(key)
    this.graph.unregisterSection(key)
  }

  invalidate(): void {
    this.graph.invalidate()
  }

  update(params: OcclusionUpdateParams): Set<string> {
    this.lastVisible = this.graph.update(params)
    return this.lastVisible
  }

  isSectionVisible(key: string): boolean {
    if (!this.registered.has(key)) return true
    return this.lastVisible.has(key)
  }

  hasRegisteredSection(key: string): boolean {
    return this.registered.has(key)
  }

  getVisibleKeys(): ReadonlySet<string> {
    return this.lastVisible
  }

  getStep(key: string): number | undefined {
    return this.graph.getStep(key)
  }

  getGraph(): SectionOcclusionGraph {
    return this.graph
  }
}

export function hsvToRgb(step: number): number {
  const hue = (step % 50) / 50
  const h = hue * 6
  const c = 0.9
  const x = c * (1 - Math.abs((h % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (h < 1) {
    r = c
    g = x
  } else if (h < 2) {
    r = x
    g = c
  } else if (h < 3) {
    g = c
    b = x
  } else if (h < 4) {
    g = x
    b = c
  } else if (h < 5) {
    r = x
    b = c
  } else {
    r = c
    b = x
  }
  const m = 0.1
  const ri = Math.round((r + m) * 255)
  const gi = Math.round((g + m) * 255)
  const bi = Math.round((b + m) * 255)
  return (ri << 16) | (gi << 8) | bi
}
