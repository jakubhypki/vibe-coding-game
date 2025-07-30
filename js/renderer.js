// Rendering system with camera support and texture integration
function render() {
    const ctx = Game.ctx;
    
    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, Game.width, Game.height);
    
    // Draw infinite world
    drawInfiniteWorld(ctx);
    
    // Draw game objects
    drawGameObjects(ctx);
    
    // Draw UI overlays
    drawUIOverlays(ctx);
}

function drawInfiniteWorld(ctx) {
    // Draw floors first
    const floors = getAllFloors();
    floors.forEach(floor => {
        if (isOnScreen(floor.x, floor.y, floor.width, floor.height)) {
            if (window.TextureManager) {
                // Use fixed positioning for floor textures so they don't move with camera
                window.TextureManager.drawTiledTexture(ctx, 'floor_tiles',
                    floor.x - Game.camera.x, floor.y - Game.camera.y, floor.width, floor.height,
                    floor.x, floor.y); // Pass world coordinates for fixed positioning
            } else {
                ctx.fillStyle = '#696969';
                ctx.fillRect(floor.x - Game.camera.x, floor.y - Game.camera.y, floor.width, floor.height);
            }
        }
    });
    
    // Draw walls
    const walls = getAllWalls();
    walls.forEach(wall => {
        if (isOnScreen(wall.x, wall.y, wall.width, wall.height)) {
            if (window.TextureManager) {
                window.TextureManager.drawTexture(ctx, 'wall_concrete', 
                    wall.x - Game.camera.x, wall.y - Game.camera.y, wall.width, wall.height);
            } else {
                ctx.fillStyle = '#8B4513';
                ctx.fillRect(wall.x - Game.camera.x, wall.y - Game.camera.y, wall.width, wall.height);
                
                // Add border
                ctx.strokeStyle = '#654321';
                ctx.lineWidth = 2;
                ctx.strokeRect(wall.x - Game.camera.x, wall.y - Game.camera.y, wall.width, wall.height);
            }
        }
    });
    
    // Draw cover objects
    const cover = getAllCover();
    cover.forEach(coverObj => {
        if (isOnScreen(coverObj.x, coverObj.y, coverObj.width, coverObj.height)) {
            const textureName = coverObj.type === 'crate' ? 'crate_wood' : 'barrel_metal';
            if (window.TextureManager) {
                window.TextureManager.drawTexture(ctx, textureName, 
                    coverObj.x - Game.camera.x, coverObj.y - Game.camera.y, coverObj.width, coverObj.height);
            } else {
                ctx.fillStyle = coverObj.type === 'crate' ? '#D2691E' : '#8B0000';
                ctx.fillRect(coverObj.x - Game.camera.x, coverObj.y - Game.camera.y, coverObj.width, coverObj.height);
                
                // Add border
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1;
                ctx.strokeRect(coverObj.x - Game.camera.x, coverObj.y - Game.camera.y, coverObj.width, coverObj.height);
            }
        }
    });
    
    // Draw multiplayer map objectives if available
    if (Game.map && Game.map.objectives) {
        Game.map.objectives.forEach(objective => {
            if (isOnScreen(objective.x, objective.y, objective.width, objective.height)) {
                if (objective.type === 'bombsite') {
                    ctx.fillStyle = 'rgba(255, 107, 53, 0.3)';
                    ctx.fillRect(objective.x - Game.camera.x, objective.y - Game.camera.y, objective.width, objective.height);
                    
                    ctx.strokeStyle = '#ff6b35';
                    ctx.lineWidth = 3;
                    ctx.strokeRect(objective.x - Game.camera.x, objective.y - Game.camera.y, objective.width, objective.height);
                    
                    // Draw bombsite label
                    ctx.fillStyle = '#ff6b35';
                    ctx.font = 'bold 20px Arial';
                    ctx.textAlign = 'center';
                    ctx.strokeStyle = '#000';
                    ctx.lineWidth = 2;
                    const labelX = objective.x + objective.width/2 - Game.camera.x;
                    const labelY = objective.y + objective.height/2 - Game.camera.y;
                    ctx.strokeText(`BOMBSITE ${objective.name}`, labelX, labelY);
                    ctx.fillText(`BOMBSITE ${objective.name}`, labelX, labelY);
                }
            }
        });
    }
    
    // Draw hostages if available
    if (Game.map && Game.map.hostages) {
        Game.map.hostages.forEach(hostage => {
            if (!hostage.rescued && isOnScreen(hostage.x - 10, hostage.y - 10, 20, 20)) {
                ctx.fillStyle = '#00ff00';
                ctx.beginPath();
                ctx.arc(hostage.x - Game.camera.x, hostage.y - Game.camera.y, 8, 0, Math.PI * 2);
                ctx.fill();
                
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2;
                ctx.stroke();
                
                // Draw H for hostage
                ctx.fillStyle = '#000';
                ctx.font = 'bold 12px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('H', hostage.x - Game.camera.x, hostage.y - Game.camera.y + 4);
            }
        });
    }
}

function drawGameObjects(ctx) {
    // Draw particles
    Game.particles.forEach(particle => {
        if (isOnScreen(particle.x - 10, particle.y - 10, 20, 20)) {
            particle.draw(ctx);
        }
    });
    
    // Draw bullets
    Game.bullets.forEach(bullet => {
        if (isOnScreen(bullet.x - 5, bullet.y - 5, 10, 10)) {
            bullet.draw(ctx);
        }
    });
    
    // Draw enemies (single player only)
    if (!Game.isMultiplayer) {
        Game.enemies.forEach(enemy => {
            if (isOnScreen(enemy.x - enemy.width, enemy.y - enemy.height, enemy.width * 2, enemy.height * 2)) {
                enemy.draw(ctx);
            }
        });
    }
    
    // Draw other players (multiplayer only)
    if (Game.isMultiplayer) {
        Game.otherPlayers.forEach(player => {
            if (isOnScreen(player.x - player.width, player.y - player.height, player.width * 2, player.height * 2)) {
                player.draw(ctx);
            }
        });
    }
    
    // Draw local player (only if not spectator)
    if (Game.player && !Game.isSpectator) {
        Game.player.draw(ctx);
    }
}

function drawUIOverlays(ctx) {
    // Draw crosshair (only if not spectator)
    if (!Game.isSpectator) {
        if (window.TextureManager) {
            window.TextureManager.drawTexture(ctx, 'crosshair', 
                Game.mouse.x - 10, Game.mouse.y - 10, 20, 20);
        } else {
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(Game.mouse.x - 10, Game.mouse.y);
            ctx.lineTo(Game.mouse.x + 10, Game.mouse.y);
            ctx.moveTo(Game.mouse.x, Game.mouse.y - 10);
            ctx.lineTo(Game.mouse.x, Game.mouse.y + 10);
            ctx.stroke();
        }
    }
    
    // Draw spectator overlay
    if (Game.isSpectator) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(0, 0, Game.width, Game.height);
        
        ctx.fillStyle = '#fff';
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.strokeText('SPECTATOR MODE', Game.width / 2, 50);
        ctx.fillText('SPECTATOR MODE', Game.width / 2, 50);
    }
    
    // Draw respawn message for multiplayer
    if (Game.isMultiplayer && Game.player && !Game.player.alive && !Game.isSpectator) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, Game.width, Game.height);
        
        ctx.fillStyle = '#fff';
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.strokeText('You are dead! Press SPACE to respawn', Game.width / 2, Game.height / 2);
        ctx.fillText('You are dead! Press SPACE to respawn', Game.width / 2, Game.height / 2);
    }
    
    // Draw chunk boundaries for debugging (optional)
    if (Game.state === 'playing' && false) { // Set to true for debugging
        drawChunkBoundaries(ctx);
    }
}

function drawChunkBoundaries(ctx) {
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.3)';
    ctx.lineWidth = 1;
    
    const startChunkX = Math.floor(Game.camera.x / Game.world.chunkSize);
    const endChunkX = Math.floor((Game.camera.x + Game.width) / Game.world.chunkSize);
    const startChunkY = Math.floor(Game.camera.y / Game.world.chunkSize);
    const endChunkY = Math.floor((Game.camera.y + Game.height) / Game.world.chunkSize);
    
    // Draw vertical lines
    for (let x = startChunkX; x <= endChunkX + 1; x++) {
        const worldX = x * Game.world.chunkSize;
        const screenX = worldX - Game.camera.x;
        ctx.beginPath();
        ctx.moveTo(screenX, 0);
        ctx.lineTo(screenX, Game.height);
        ctx.stroke();
    }
    
    // Draw horizontal lines
    for (let y = startChunkY; y <= endChunkY + 1; y++) {
        const worldY = y * Game.world.chunkSize;
        const screenY = worldY - Game.camera.y;
        ctx.beginPath();
        ctx.moveTo(0, screenY);
        ctx.lineTo(Game.width, screenY);
        ctx.stroke();
    }
}

// Initialize texture manager when available
function initializeTextures() {
    if (window.TextureManager) {
        window.TextureManager.loadAllTextures().then(() => {
            console.log('All textures loaded successfully');
        }).catch(error => {
            console.warn('Some textures failed to load:', error);
        });
    }
}