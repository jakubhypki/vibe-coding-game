// Camera system functions
function updateCamera() {
    if (Game.player && !Game.isSpectator) {
        // Set camera target to player position
        Game.camera.targetX = Game.player.x - Game.width / 2;
        Game.camera.targetY = Game.player.y - Game.height / 2;
    }
    
    // Smooth camera movement
    Game.camera.x += (Game.camera.targetX - Game.camera.x) * Game.camera.smoothing;
    Game.camera.y += (Game.camera.targetY - Game.camera.y) * Game.camera.smoothing;
    
    // Apply camera bounds
    Game.camera.x = Math.max(Game.camera.bounds.minX, 
                    Math.min(Game.camera.bounds.maxX - Game.width, Game.camera.x));
    Game.camera.y = Math.max(Game.camera.bounds.minY, 
                    Math.min(Game.camera.bounds.maxY - Game.height, Game.camera.y));
    
    // Update mouse world coordinates
    Game.mouse.worldX = Game.mouse.x + Game.camera.x;
    Game.mouse.worldY = Game.mouse.y + Game.camera.y;
}

// Infinite map generation system
function getChunkKey(chunkX, chunkY) {
    return `${chunkX},${chunkY}`;
}

function worldToChunk(worldX, worldY) {
    return {
        x: Math.floor(worldX / Game.world.chunkSize),
        y: Math.floor(worldY / Game.world.chunkSize)
    };
}

function generateChunk(chunkX, chunkY) {
    const chunkKey = getChunkKey(chunkX, chunkY);
    if (Game.world.generatedChunks.has(chunkKey)) {
        return Game.world.loadedChunks.get(chunkKey);
    }
    
    const chunk = {
        x: chunkX,
        y: chunkY,
        worldX: chunkX * Game.world.chunkSize,
        worldY: chunkY * Game.world.chunkSize,
        walls: [],
        floors: [],
        cover: [],
        enemies: []
    };
    
    // Generate procedural content for this chunk
    const seed = chunkX * 1000 + chunkY; // Simple seed based on chunk coordinates
    const random = seededRandom(seed);
    
    // Generate floor for entire chunk
    chunk.floors.push({
        x: chunk.worldX,
        y: chunk.worldY,
        width: Game.world.chunkSize,
        height: Game.world.chunkSize,
        type: 'floor'
    });
    
    // Generate walls
    const wallCount = 3 + Math.floor(random() * 5);
    for (let i = 0; i < wallCount; i++) {
        const wall = {
            x: chunk.worldX + random() * (Game.world.chunkSize - 100),
            y: chunk.worldY + random() * (Game.world.chunkSize - 100),
            width: 20 + random() * 60,
            height: 20 + random() * 60,
            type: 'wall'
        };
        chunk.walls.push(wall);
    }
    
    // Generate cover objects
    const coverCount = 2 + Math.floor(random() * 4);
    for (let i = 0; i < coverCount; i++) {
        const cover = {
            x: chunk.worldX + random() * (Game.world.chunkSize - 50),
            y: chunk.worldY + random() * (Game.world.chunkSize - 50),
            width: 30 + random() * 20,
            height: 30 + random() * 20,
            type: random() > 0.5 ? 'crate' : 'barrel'
        };
        chunk.cover.push(cover);
    }
    
    // Generate enemies for single player
    if (!Game.isMultiplayer) {
        const enemyCount = 1 + Math.floor(random() * 3);
        for (let i = 0; i < enemyCount; i++) {
            const enemy = new Enemy(
                chunk.worldX + random() * Game.world.chunkSize,
                chunk.worldY + random() * Game.world.chunkSize
            );
            chunk.enemies.push(enemy);
        }
    }
    
    Game.world.loadedChunks.set(chunkKey, chunk);
    Game.world.generatedChunks.add(chunkKey);
    
    return chunk;
}

function updateWorldGeneration() {
    if (!Game.player) return;
    
    const playerChunk = worldToChunk(Game.player.x, Game.player.y);
    const loadDistance = Game.world.loadDistance;
    
    // Generate chunks around player
    for (let x = playerChunk.x - loadDistance; x <= playerChunk.x + loadDistance; x++) {
        for (let y = playerChunk.y - loadDistance; y <= playerChunk.y + loadDistance; y++) {
            generateChunk(x, y);
        }
    }
    
    // Update camera bounds based on generated world
    const minChunkX = playerChunk.x - loadDistance;
    const maxChunkX = playerChunk.x + loadDistance;
    const minChunkY = playerChunk.y - loadDistance;
    const maxChunkY = playerChunk.y + loadDistance;
    
    Game.camera.bounds.minX = minChunkX * Game.world.chunkSize;
    Game.camera.bounds.maxX = (maxChunkX + 1) * Game.world.chunkSize;
    Game.camera.bounds.minY = minChunkY * Game.world.chunkSize;
    Game.camera.bounds.maxY = (maxChunkY + 1) * Game.world.chunkSize;
    
    // Unload distant chunks to save memory
    const chunksToUnload = [];
    Game.world.loadedChunks.forEach((chunk, key) => {
        const distance = Math.max(
            Math.abs(chunk.x - playerChunk.x),
            Math.abs(chunk.y - playerChunk.y)
        );
        if (distance > loadDistance + 1) {
            chunksToUnload.push(key);
        }
    });
    
    chunksToUnload.forEach(key => {
        const chunk = Game.world.loadedChunks.get(key);
        // Remove enemies from the main game arrays
        if (chunk.enemies) {
            chunk.enemies.forEach(enemy => {
                const index = Game.enemies.indexOf(enemy);
                if (index > -1) {
                    Game.enemies.splice(index, 1);
                }
            });
        }
        Game.world.loadedChunks.delete(key);
    });
    
    // Add enemies from loaded chunks to main game arrays (only if not already added)
    const currentEnemyIds = new Set(Game.enemies.map(e => e.id));
    Game.world.loadedChunks.forEach(chunk => {
        if (chunk.enemies) {
            chunk.enemies.forEach(enemy => {
                if (!currentEnemyIds.has(enemy.id)) {
                    Game.enemies.push(enemy);
                }
            });
        }
    });
    
    // Remove enemies that are no longer in loaded chunks
    Game.enemies = Game.enemies.filter(enemy => {
        const enemyChunk = worldToChunk(enemy.x, enemy.y);
        const chunkKey = getChunkKey(enemyChunk.x, enemyChunk.y);
        return Game.world.loadedChunks.has(chunkKey);
    });
}

function getAllWalls() {
    const walls = [];
    Game.world.loadedChunks.forEach(chunk => {
        walls.push(...chunk.walls);
    });
    return walls;
}

function getAllCover() {
    const cover = [];
    Game.world.loadedChunks.forEach(chunk => {
        cover.push(...chunk.cover);
    });
    return cover;
}

function getAllFloors() {
    const floors = [];
    Game.world.loadedChunks.forEach(chunk => {
        floors.push(...chunk.floors);
    });
    return floors;
}

// Seeded random number generator
function seededRandom(seed) {
    let m = 0x80000000; // 2**31
    let a = 1103515245;
    let c = 12345;
    let state = seed ? seed : Math.floor(Math.random() * (m - 1));
    
    return function() {
        state = (a * state + c) % m;
        return state / (m - 1);
    };
}

// Check if a point is visible on screen (for optimization)
function isOnScreen(x, y, width = 0, height = 0) {
    return x + width >= Game.camera.x &&
           x <= Game.camera.x + Game.width &&
           y + height >= Game.camera.y &&
           y <= Game.camera.y + Game.height;
}

// Find a safe spawn position that doesn't collide with walls
function findSafeSpawnPosition(centerX = 0, centerY = 0, searchRadius = 200) {
    const playerWidth = 24;
    const playerHeight = 24;
    
    // Try the center position first
    if (isPositionSafe(centerX, centerY, playerWidth, playerHeight)) {
        return { x: centerX, y: centerY };
    }
    
    // Try positions in expanding circles
    for (let radius = 50; radius <= searchRadius; radius += 25) {
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;
            
            if (isPositionSafe(x, y, playerWidth, playerHeight)) {
                return { x, y };
            }
        }
    }
    
    // If no safe position found, return center anyway (fallback)
    console.warn('No safe spawn position found, using center');
    return { x: centerX, y: centerY };
}

// Check if a position is safe (no collision with walls or cover)
function isPositionSafe(x, y, width, height) {
    const rect = {
        x: x - width/2,
        y: y - height/2,
        width: width,
        height: height
    };
    
    // Check collision with walls
    const walls = getAllWalls();
    for (const wall of walls) {
        if (rectCollision(rect, wall)) {
            return false;
        }
    }
    
    // Check collision with cover objects
    const cover = getAllCover();
    for (const coverObj of cover) {
        if (rectCollision(rect, coverObj)) {
            return false;
        }
    }
    
    return true;
}

// Rectangle collision detection helper
function rectCollision(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
}