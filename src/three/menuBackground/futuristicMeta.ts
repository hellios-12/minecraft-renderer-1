/** Settings / labels only — no Three.js or DocumentRenderer (safe for defaultOptions imports). */

export const FUTURISTIC_SCENE_IDS = ['galaxy', 'nether', 'end', 'cyber', 'light'] as const
export type FuturisticSceneId = typeof FUTURISTIC_SCENE_IDS[number]

export const FUTURISTIC_CAMERA_IDS = ['cruise', 'barrel', 'dive', 'orbit', 'snake'] as const
export type FuturisticCameraId = typeof FUTURISTIC_CAMERA_IDS[number]

export const FUTURISTIC_SCENE_LABELS: Record<FuturisticSceneId, string> = {
  galaxy: 'Galaxy',
  nether: 'Nether',
  end: 'The End',
  cyber: 'Cyber',
  light: 'Light Space'
}

export const FUTURISTIC_CAMERA_LABELS: Record<FuturisticCameraId, string> = {
  cruise: 'Cruise',
  barrel: 'Barrel',
  dive: 'Dive',
  orbit: 'Orbit',
  snake: 'Snake'
}

export const MINECRAFT_BLOCK_GROUP_IDS = ['mixed', 'stainedGlass', 'wool', 'construction', 'glow', 'world'] as const
export type MinecraftBlockGroupId = typeof MINECRAFT_BLOCK_GROUP_IDS[number]

export const MINECRAFT_BLOCK_GROUP_LABELS: Record<MinecraftBlockGroupId, string> = {
  mixed: 'Mixed',
  stainedGlass: 'Stained glass',
  wool: 'Wool',
  construction: 'Construction',
  glow: 'Glow',
  world: 'World (grass & ores)'
}
