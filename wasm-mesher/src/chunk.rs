/// Efficient chunk data structure with fast indexing
///
/// Uses the same indexing pattern as worldLightHolder.ts:
/// index = localX + localZ * 16 + localY * 16 * 16

pub const CHUNK_SIZE: i32 = 16;

#[derive(Clone)]
pub struct ChunkData {
    pub block_states: Vec<u16>,
    pub block_light: Vec<u8>,
    pub sky_light: Vec<u8>,
    pub biomes: Vec<u8>,
    pub chunk_x: i32,
    pub chunk_z: i32,
    pub world_min_y: i32,
    pub world_height: i32,
}

impl ChunkData {
    pub fn new(
        chunk_x: i32,
        chunk_z: i32,
        world_min_y: i32,
        world_height: i32,
    ) -> Self {
        let size = (CHUNK_SIZE * CHUNK_SIZE * world_height) as usize;
        Self {
            block_states: vec![0; size],
            block_light: vec![0; size],
            sky_light: vec![15; size], // Default to max sky light
            biomes: vec![0; size],
            chunk_x,
            chunk_z,
            world_min_y,
            world_height,
        }
    }

    /// Get index for a world position
    /// Same algorithm as worldLightHolder.getIndex()
    #[inline(always)]
    pub fn get_index(&self, x: i32, y: i32, z: i32) -> usize {
        let local_x = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        let local_z = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        let local_y = y - self.world_min_y;
        (local_x + local_z * CHUNK_SIZE + local_y * CHUNK_SIZE * CHUNK_SIZE) as usize
    }

    #[inline(always)]
    pub fn get_block_state(&self, x: i32, y: i32, z: i32) -> u16 {
        let idx = self.get_index(x, y, z);
        *self.block_states.get(idx).unwrap_or(&0)
    }

    #[inline(always)]
    pub fn get_block_light(&self, x: i32, y: i32, z: i32) -> u8 {
        let idx = self.get_index(x, y, z);
        *self.block_light.get(idx).unwrap_or(&0)
    }

    #[inline(always)]
    pub fn get_sky_light(&self, x: i32, y: i32, z: i32) -> u8 {
        let idx = self.get_index(x, y, z);
        *self.sky_light.get(idx).unwrap_or(&15)
    }

    #[inline(always)]
    pub fn get_biome(&self, x: i32, y: i32, z: i32) -> u8 {
        let idx = self.get_index(x, y, z);
        *self.biomes.get(idx).unwrap_or(&0)
    }
}

/// Fast block lookup across multiple chunks
pub struct WorldView {
    chunks: Vec<ChunkData>,
    world_min_y: i32,
    world_max_y: i32,
}

impl WorldView {
    pub fn new(chunks: Vec<ChunkData>, world_min_y: i32, world_max_y: i32) -> Self {
        Self {
            chunks,
            world_min_y,
            world_max_y,
        }
    }

    /// Get chunk for a world position
    #[inline(always)]
    fn get_chunk(&self, x: i32, z: i32) -> Option<&ChunkData> {
        let chunk_x = (x / CHUNK_SIZE) * CHUNK_SIZE;
        let chunk_z = (z / CHUNK_SIZE) * CHUNK_SIZE;

        self.chunks.iter().find(|c| c.chunk_x == chunk_x && c.chunk_z == chunk_z)
    }

    #[inline(always)]
    pub fn get_block_state(&self, x: i32, y: i32, z: i32) -> u16 {
        if y < self.world_min_y || y >= self.world_max_y {
            return 0; // Air outside world bounds
        }

        self.get_chunk(x, z)
            .map(|chunk| chunk.get_block_state(x, y, z))
            .unwrap_or(0)
    }

    #[inline(always)]
    pub fn get_block_light(&self, x: i32, y: i32, z: i32) -> u8 {
        if y < self.world_min_y || y >= self.world_max_y {
            return 0;
        }

        self.get_chunk(x, z)
            .map(|chunk| chunk.get_block_light(x, y, z))
            .unwrap_or(0)
    }

    #[inline(always)]
    pub fn get_sky_light(&self, x: i32, y: i32, z: i32) -> u8 {
        if y < self.world_min_y || y >= self.world_max_y {
            return 15; // Max sky light outside world
        }

        self.get_chunk(x, z)
            .map(|chunk| chunk.get_sky_light(x, y, z))
            .unwrap_or(15)
    }

    #[inline(always)]
    pub fn get_biome(&self, x: i32, y: i32, z: i32) -> u8 {
        if y < self.world_min_y || y >= self.world_max_y {
            return 0;
        }

        self.get_chunk(x, z)
            .map(|chunk| chunk.get_biome(x, y, z))
            .unwrap_or(0)
    }
}
