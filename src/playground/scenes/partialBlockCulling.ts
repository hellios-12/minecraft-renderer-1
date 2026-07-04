import { BasePlaygroundScene } from '../baseScene'

/** Manual check for issue #49/#73: partial-block culling + cactus on grass (1.18.2). */
export default class extends BasePlaygroundScene {
  override version = '1.18.2'
  enableCameraOrbitControl = true

  override setupWorld() {
    const ox = -8
    const oz = -8
    const yFarmland = 64
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        this.addWorldBlock(ox + x, yFarmland - 1, oz + z, 'dirt')
        this.addWorldBlock(ox + x, yFarmland, oz + z, 'farmland')
      }
    }

    const stairY = 64
    const stairProps = { facing: 'east', half: 'bottom', shape: 'straight', waterlogged: false } as const
    for (let x = 0; x < 8; x++) {
      this.addWorldBlock(20 + x, stairY, 0, 'cut_copper_stairs', stairProps)
      this.addWorldBlock(20 + x, stairY, 1, 'cut_copper_stairs', stairProps)
    }
    for (let x = 0; x < 6; x++) {
      this.addWorldBlock(20 + x, stairY, 4, 'cut_copper_stairs', stairProps)
      this.addWorldBlock(20 + x, stairY + 1, 4, 'cut_copper_stairs', stairProps)
    }

    const cactusY = 64
    for (let x = 0; x < 4; x++) {
      this.addWorldBlock(30 + x, cactusY - 1, 8, 'grass_block')
      this.addWorldBlock(30 + x, cactusY, 8, 'cactus')
    }
    this.addWorldBlock(35, cactusY - 1, 8, 'grass_block')
    this.addWorldBlock(35, cactusY, 8, 'cactus')
    this.addWorldBlock(35, cactusY + 1, 8, 'cactus')

    this.addWorldBlock(30, cactusY - 1, 10, 'soul_sand')
    this.addWorldBlock(31, cactusY - 1, 10, 'stone_slab', { type: 'bottom' })
    this.addWorldBlock(32, cactusY - 1, 10, 'stone_slab', { type: 'bottom' })
  }
}
