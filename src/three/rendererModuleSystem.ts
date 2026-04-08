import { WorldRendererThree } from './worldRendererThree'

/**
 * Instance interface for module controllers
 */
export interface RendererModuleController {
  enable(): void
  disable(): void
  dispose(): void

  enablementCheck?: () => boolean
  autoEnableCheck?: () => boolean // Called when config updates, returns true to enable, false to disable
  render?: (deltaTime: number) => void
}

/**
 * Constructor type for module controllers
 */
export type RendererModuleControllerConstructor = new (
  worldRenderer: WorldRendererThree
) => RendererModuleController

export interface RendererModuleManifest {
  id: string

  controller: RendererModuleControllerConstructor

  enabledDefault?: boolean
  cannotBeDisabled?: boolean
  slowSystemAutoDisable?: boolean
  userSettingsSchema?: Record<string, any>

  requiresHeightmap?: boolean
}

export interface RegisteredModule {
  manifest: RendererModuleManifest
  controller: RendererModuleController
  enabled: boolean
  toggle: () => boolean
}

export interface ModuleInfo {
  id: string
  enabled: boolean
  configState: 'enabled' | 'disabled' | 'auto'
  forceState: boolean | null
  enabledDefault: boolean
  cannotBeDisabled: boolean
}

/** Maps config state string to boolean | null (true=force ON, false=force OFF, null=AUTO) */
export function configStateToForceState(state: 'enabled' | 'disabled' | 'auto' | undefined): boolean | null {
  if (state === 'enabled') return true
  if (state === 'disabled') return false
  return null
}

/** Maps boolean | null to config state string ('enabled' | 'disabled' | 'auto') */
export function forceStateToConfigState(forceState: boolean | null): 'enabled' | 'disabled' | 'auto' {
  if (forceState === true) return 'enabled'
  if (forceState === false) return 'disabled'
  return 'auto'
}
