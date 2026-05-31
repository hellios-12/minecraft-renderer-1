import type { ResourcesManager } from '../../resourcesManager/resourcesManager'
import type { FuturisticCameraId, FuturisticSceneId, MinecraftBlockGroupId } from './futuristic'
import { MENU_BACKGROUND_OPTION_DEFAULTS } from './config'

export type { FuturisticCameraId, FuturisticSceneId, MinecraftBlockGroupId } from './futuristic'

export type MenuBackgroundMode = 'classic' | 'futuristic' | 'worldBlocks'

export interface MenuBackgroundOptions {
  /** Visual style. Defaults to {@link MENU_BACKGROUND_OPTION_DEFAULTS.mode}, or `worldBlocks` in single-file build. */
  mode?: MenuBackgroundMode
  /** Futuristic style: load block atlas and render textured cubes (requires assets / mcData). */
  useMinecraftTextures?: boolean
  futuristicScene?: FuturisticSceneId
  futuristicCamera?: FuturisticCameraId
  /** Block pool when {@link useMinecraftTextures} is enabled. */
  futuristicBlockGroup?: MinecraftBlockGroupId
  /** Camera path speed (1 = 100%). */
  futuristicCameraSpeed?: number
  /** Block fly-through + sky drift speed (1 = 100%). */
  futuristicBlockSpeed?: number
  /**
   * Optional shared resource manager (e.g. appViewer.resourcesManager).
   * Caller should run `updateAssetsData` after mcData is loaded when using textured cubes.
   */
  resourcesManager?: ResourcesManager
}

export function resolveMenuBackgroundMode(
  options?: MenuBackgroundOptions,
  singleFileBuild = false
): MenuBackgroundMode {
  if (options?.mode) return options.mode
  if (singleFileBuild) return 'worldBlocks'
  return MENU_BACKGROUND_OPTION_DEFAULTS.mode
}
