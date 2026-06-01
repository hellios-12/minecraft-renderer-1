import {
  FUTURISTIC_CAMERA_IDS,
  FUTURISTIC_CAMERA_LABELS,
  FUTURISTIC_SCENE_IDS,
  FUTURISTIC_SCENE_LABELS,
  MINECRAFT_BLOCK_GROUP_IDS,
  MINECRAFT_BLOCK_GROUP_LABELS
} from './futuristic'
import { MENU_BACKGROUND_OPTION_DEFAULTS } from './config'

export type RendererOptionMeta = {
  possibleValues?: string[] | Array<[string, string]>
  isCustomInput?: boolean
  min?: number
  max?: number
  unit?: string
  text?: string
  tooltip?: string
  requiresRestart?: boolean
}

export type RendererDefaultOptionKey = keyof typeof RENDERER_DEFAULT_OPTIONS

const MB = MENU_BACKGROUND_OPTION_DEFAULTS

/** Default values for options owned by minecraft-renderer (spread into app `defaultOptions`). */
export const RENDERER_DEFAULT_OPTIONS = {
  rendererWorldPerformance: 'normal' as 'low-energy' | 'normal' | 'maximum',
  rendererMeshersCountOverride: null as number | null,
  starfieldRendering: true,
  defaultSkybox: true,
  menuBackgroundMode: MB.mode,
  menuBackgroundMinecraftTextures: MB.minecraftTextures,
  menuBackgroundFuturisticScene: MB.futuristicScene,
  menuBackgroundFuturisticCamera: MB.futuristicCamera,
  menuBackgroundFuturisticBlockGroup: MB.futuristicBlockGroup,
  menuBackgroundFuturisticCameraSpeed: MB.futuristicCameraSpeedPercent,
  menuBackgroundFuturisticBlockSpeed: MB.futuristicBlockSpeedPercent,
  rendererFuturisticReveal: false,
  rendererPerfDebugOverlay: false,
  disableBlockEntityTextures: false
} as const

/** Settings UI metadata for {@link RENDERER_DEFAULT_OPTIONS} keys. */
export const RENDERER_OPTIONS_META: Partial<Record<RendererDefaultOptionKey, RendererOptionMeta>> = {
  menuBackgroundMode: {
    possibleValues: [['classic', 'Classic'], ['futuristic', 'Futuristic']],
    requiresRestart: true
  },
  menuBackgroundMinecraftTextures: {
    text: 'Minecraft block textures',
    tooltip: 'Use block atlas on futuristic menu cubes (loads assets on menu)'
  },
  menuBackgroundFuturisticScene: {
    possibleValues: FUTURISTIC_SCENE_IDS.map(id => [id, FUTURISTIC_SCENE_LABELS[id]] as [string, string])
  },
  menuBackgroundFuturisticCamera: {
    possibleValues: FUTURISTIC_CAMERA_IDS.map(id => [id, FUTURISTIC_CAMERA_LABELS[id]] as [string, string])
  },
  menuBackgroundFuturisticBlockGroup: {
    possibleValues: MINECRAFT_BLOCK_GROUP_IDS.map(id => [id, MINECRAFT_BLOCK_GROUP_LABELS[id]] as [string, string]),
    text: 'Block pool',
    tooltip: 'Block set for textured menu cubes (requires Minecraft textures)'
  },
  menuBackgroundFuturisticCameraSpeed: {
    text: 'Camera speed',
    tooltip: 'Orbit / fly-through camera path speed. 0 freezes the path; mouse parallax still works.',
    min: 0,
    max: 200,
    unit: '%'
  },
  menuBackgroundFuturisticBlockSpeed: {
    text: 'Block speed',
    tooltip: 'Floating blocks and sky rotation. Independent of camera path speed.',
    min: 0,
    max: 200,
    unit: '%'
  },
  rendererWorldPerformance: {
    text: 'World performance',
    tooltip: 'Background workers for chunk geometry. Reload to apply.',
    requiresRestart: true,
    possibleValues: [
      ['low-energy', 'Low Energy'],
      ['normal', 'Normal'],
      ['maximum', 'Maximum']
    ]
  },
  starfieldRendering: {
    text: 'Starfield'
  },
  defaultSkybox: {
    text: 'Default skybox'
  },
  rendererFuturisticReveal: {
    text: 'Futuristic world reveal'
  },
  rendererPerfDebugOverlay: {
    text: 'Performance debug overlay'
  },
  disableBlockEntityTextures: {
    text: 'Disable block entity textures',
    tooltip: 'Skips signs, banners, heads, maps, etc.'
  }
}

/** Grouped keys for the Render settings screen (section title + option keys). */
export const RENDERER_RENDER_GUI_SECTIONS: ReadonlyArray<{
  title: string
  keys: readonly RendererDefaultOptionKey[]
}> = [
  {
    title: 'Menu background',
    keys: [
      'menuBackgroundMode',
      'menuBackgroundMinecraftTextures',
      'menuBackgroundFuturisticScene',
      'menuBackgroundFuturisticCamera',
      'menuBackgroundFuturisticBlockGroup',
      'menuBackgroundFuturisticCameraSpeed',
      'menuBackgroundFuturisticBlockSpeed'
    ]
  },
  {
    title: 'World rendering',
    keys: [
      'rendererWorldPerformance',
      'starfieldRendering',
      'defaultSkybox',
      'disableBlockEntityTextures'
    ]
  },
  {
    title: 'Renderer debug',
    keys: [
      'rendererFuturisticReveal',
      'rendererPerfDebugOverlay'
    ]
  }
]
