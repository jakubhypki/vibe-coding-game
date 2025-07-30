const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 2137;

// Serve static files
app.use(express.static(path.join(__dirname)));

// Game state
const gameRooms = new Map();
const players = new Map();

class GameRoom {
    constructor(id, gameMode = 'deathmatch') {
        this.id = id;
        this.players = new Map();
        this.spectators = new Map();
        this.bullets = [];
        this.obstacles = [];
        this.gameState = 'waiting'; // waiting, playing, finished, roundEnd
        this.gameMode = gameMode; // deathmatch, teamdeathmatch, defuse, hostage
        this.maxPlayers = gameMode === 'deathmatch' ? 16 : 10;
        this.maxSpectators = 6;
        this.lastUpdate = Date.now();
        this.playerColors = ['#0066cc', '#cc6600', '#00cc66', '#cc0066', '#6600cc', '#cccc00', '#00cccc', '#cc6666', '#ff4444', '#44ff44', '#4444ff', '#ffff44', '#ff44ff', '#44ffff'];
        this.generateObstacles();
        this.map = this.generateMap();
        this.roundTime = gameMode === 'deathmatch' ? 300000 : 120000; // 5min for DM, 2min for others
        this.roundStartTime = null;
        this.ctScore = 0;
        this.tScore = 0;
        this.maxRounds = gameMode === 'deathmatch' ? 1 : 15;
        this.currentRound = 1;
        this.chatMessages = [];
        this.maxChatMessages = 50;
        this.bombPlanted = false;
        this.bombTimer = 45000; // 45 seconds
        this.bombPlantTime = null;
        this.hostagesRescued = 0;
        this.totalHostages = 4;
    }

    generateMap() {
        const mapWidth = 1200;
        const mapHeight = 800;
        const mapTypes = ['dust2', 'inferno', 'mirage', 'cache'];
        const selectedType = mapTypes[Math.floor(Math.random() * mapTypes.length)];
        
        const map = {
            width: mapWidth,
            height: mapHeight,
            type: selectedType,
            walls: [],
            floors: [],
            spawnPoints: {
                ct: [],
                t: []
            },
            objectives: [],
            hostages: [],
            cover: [],
            textures: {
                walls: 'wall_concrete.png',
                floors: 'floor_tiles.png',
                bombsites: 'bombsite_marker.png'
            }
        };

        // Generate different map layouts based on type
        switch (selectedType) {
            case 'dust2':
                this.generateDust2Layout(map);
                break;
            case 'inferno':
                this.generateInfernoLayout(map);
                break;
            case 'mirage':
                this.generateMirageLayout(map);
                break;
            case 'cache':
                this.generateCacheLayout(map);
                break;
        }

        // Add hostages for hostage rescue mode
        if (this.gameMode === 'hostage') {
            this.addHostages(map);
        }

        return map;
    }

    generateDust2Layout(map) {
        // Main corridors and rooms
        const rooms = [
            { x: 50, y: 50, width: 200, height: 150, type: 'ct_spawn' },
            { x: 950, y: 600, width: 200, height: 150, type: 't_spawn' },
            { x: 300, y: 100, width: 150, height: 100, type: 'long_a' },
            { x: 600, y: 500, width: 200, height: 120, type: 'bombsite_a' },
            { x: 100, y: 400, width: 180, height: 100, type: 'bombsite_b' },
            { x: 500, y: 200, width: 100, height: 200, type: 'mid' }
        ];

        // Create walls around rooms and corridors
        rooms.forEach(room => {
            // Room walls
            map.walls.push(
                { x: room.x - 10, y: room.y - 10, width: 10, height: room.height + 20, type: 'wall' },
                { x: room.x + room.width, y: room.y - 10, width: 10, height: room.height + 20, type: 'wall' },
                { x: room.x - 10, y: room.y - 10, width: room.width + 20, height: 10, type: 'wall' },
                { x: room.x - 10, y: room.y + room.height, width: room.width + 20, height: 10, type: 'wall' }
            );
            
            // Floor
            map.floors.push({
                x: room.x,
                y: room.y,
                width: room.width,
                height: room.height,
                type: 'floor'
            });
        });

        // Add cover objects
        map.cover.push(
            { x: 400, y: 300, width: 60, height: 20, type: 'crate' },
            { x: 700, y: 200, width: 40, height: 40, type: 'barrel' },
            { x: 200, y: 500, width: 80, height: 30, type: 'crate' }
        );

        // Spawn points
        for (let i = 0; i < 5; i++) {
            map.spawnPoints.ct.push({
                x: 70 + i * 30,
                y: 100 + Math.random() * 50
            });
            map.spawnPoints.t.push({
                x: 970 + i * 30,
                y: 650 + Math.random() * 50
            });
        }

        // Objectives
        map.objectives.push(
            { type: 'bombsite', name: 'A', x: 650, y: 550, width: 100, height: 70 },
            { type: 'bombsite', name: 'B', x: 150, y: 450, width: 100, height: 70 }
        );
    }

    generateInfernoLayout(map) {
        // Inferno-style narrow corridors and apartments
        const structures = [
            { x: 50, y: 50, width: 180, height: 120, type: 'ct_spawn' },
            { x: 970, y: 630, width: 180, height: 120, type: 't_spawn' },
            { x: 300, y: 200, width: 200, height: 80, type: 'apartments' },
            { x: 600, y: 400, width: 150, height: 100, type: 'bombsite_a' },
            { x: 200, y: 500, width: 120, height: 80, type: 'bombsite_b' }
        ];

        structures.forEach(struct => {
            // Create complex wall patterns
            map.walls.push(
                { x: struct.x - 15, y: struct.y - 15, width: 15, height: struct.height + 30, type: 'wall' },
                { x: struct.x + struct.width, y: struct.y - 15, width: 15, height: struct.height + 30, type: 'wall' },
                { x: struct.x - 15, y: struct.y - 15, width: struct.width + 30, height: 15, type: 'wall' },
                { x: struct.x - 15, y: struct.y + struct.height, width: struct.width + 30, height: 15, type: 'wall' }
            );
            
            map.floors.push({
                x: struct.x,
                y: struct.y,
                width: struct.width,
                height: struct.height,
                type: 'floor'
            });
        });

        // Spawn points
        for (let i = 0; i < 5; i++) {
            map.spawnPoints.ct.push({ x: 80 + i * 25, y: 90 + Math.random() * 40 });
            map.spawnPoints.t.push({ x: 1000 + i * 25, y: 670 + Math.random() * 40 });
        }

        map.objectives.push(
            { type: 'bombsite', name: 'A', x: 650, y: 450, width: 100, height: 70 },
            { type: 'bombsite', name: 'B', x: 250, y: 550, width: 100, height: 70 }
        );
    }

    generateMirageLayout(map) {
        // Mirage-style open areas with connector
        const areas = [
            { x: 80, y: 80, width: 160, height: 100, type: 'ct_spawn' },
            { x: 960, y: 620, width: 160, height: 100, type: 't_spawn' },
            { x: 400, y: 150, width: 180, height: 120, type: 'connector' },
            { x: 700, y: 350, width: 140, height: 90, type: 'bombsite_a' },
            { x: 180, y: 450, width: 140, height: 90, type: 'bombsite_b' }
        ];

        areas.forEach(area => {
            map.walls.push(
                { x: area.x - 12, y: area.y - 12, width: 12, height: area.height + 24, type: 'wall' },
                { x: area.x + area.width, y: area.y - 12, width: 12, height: area.height + 24, type: 'wall' },
                { x: area.x - 12, y: area.y - 12, width: area.width + 24, height: 12, type: 'wall' },
                { x: area.x - 12, y: area.y + area.height, width: area.width + 24, height: 12, type: 'wall' }
            );
            
            map.floors.push({
                x: area.x,
                y: area.y,
                width: area.width,
                height: area.height,
                type: 'floor'
            });
        });

        // Spawn points
        for (let i = 0; i < 5; i++) {
            map.spawnPoints.ct.push({ x: 100 + i * 25, y: 110 + Math.random() * 30 });
            map.spawnPoints.t.push({ x: 980 + i * 25, y: 650 + Math.random() * 30 });
        }

        map.objectives.push(
            { type: 'bombsite', name: 'A', x: 730, y: 380, width: 80, height: 60 },
            { type: 'bombsite', name: 'B', x: 210, y: 480, width: 80, height: 60 }
        );
    }

    generateCacheLayout(map) {
        // Cache-style industrial layout
        const zones = [
            { x: 60, y: 60, width: 170, height: 110, type: 'ct_spawn' },
            { x: 970, y: 630, width: 170, height: 110, type: 't_spawn' },
            { x: 350, y: 180, width: 200, height: 100, type: 'main' },
            { x: 650, y: 380, width: 160, height: 100, type: 'bombsite_a' },
            { x: 150, y: 480, width: 160, height: 100, type: 'bombsite_b' }
        ];

        zones.forEach(zone => {
            map.walls.push(
                { x: zone.x - 10, y: zone.y - 10, width: 10, height: zone.height + 20, type: 'wall' },
                { x: zone.x + zone.width, y: zone.y - 10, width: 10, height: zone.height + 20, type: 'wall' },
                { x: zone.x - 10, y: zone.y - 10, width: zone.width + 20, height: 10, type: 'wall' },
                { x: zone.x - 10, y: zone.y + zone.height, width: zone.width + 20, height: 10, type: 'wall' }
            );
            
            map.floors.push({
                x: zone.x,
                y: zone.y,
                width: zone.width,
                height: zone.height,
                type: 'floor'
            });
        });

        // Spawn points
        for (let i = 0; i < 5; i++) {
            map.spawnPoints.ct.push({ x: 90 + i * 25, y: 90 + Math.random() * 40 });
            map.spawnPoints.t.push({ x: 1000 + i * 25, y: 660 + Math.random() * 40 });
        }

        map.objectives.push(
            { type: 'bombsite', name: 'A', x: 680, y: 410, width: 100, height: 70 },
            { type: 'bombsite', name: 'B', x: 180, y: 510, width: 100, height: 70 }
        );
    }

    addHostages(map) {
        // Add hostages in random safe locations
        const safeZones = [
            { x: 300, y: 300, width: 100, height: 100 },
            { x: 600, y: 200, width: 100, height: 100 },
            { x: 200, y: 500, width: 100, height: 100 },
            { x: 800, y: 400, width: 100, height: 100 }
        ];

        for (let i = 0; i < this.totalHostages; i++) {
            const zone = safeZones[i % safeZones.length];
            map.hostages.push({
                id: i,
                x: zone.x + Math.random() * zone.width,
                y: zone.y + Math.random() * zone.height,
                rescued: false
            });
        }
    }

    addPlayer(socketId, playerData, isSpectator = false) {
        if (isSpectator) {
            if (this.spectators.size >= this.maxSpectators) {
                return false;
            }
            this.spectators.set(socketId, {
                id: socketId,
                name: playerData.name,
                joinTime: Date.now()
            });
            return true;
        }

        if (this.players.size >= this.maxPlayers) {
            return false;
        }

        const spawnPos = this.getRandomSpawnPosition();
        const playerIndex = this.players.size;

        const team = this.gameMode === 'deathmatch' ? 'dm' :
                    (this.players.size % 2 === 0 ? 'ct' : 't');
        
        const spawnPoint = this.getSpawnPoint(team);

        this.players.set(socketId, {
            id: socketId,
            x: spawnPos.x,
            y: spawnPos.y,
            x: spawnPoint.x,
            y: spawnPoint.y,
            angle: 0,
            health: 100,
            maxHealth: 100,
            score: 0,
            kills: 0,
            deaths: 0,
            weapon: {
                ammo: 30,
                maxAmmo: 30,
                reserveAmmo: 90,
                lastShot: 0,
                type: 'ak47'
            },
            team: playerIndex % 2 === 0 ? 'ct' : 't',
            color: this.playerColors[Math.floor(Math.random() * this.playerColors.length)],
            team: team,
            alive: true,
            respawnTimer: 0,
            money: this.gameMode === 'deathmatch' ? 16000 : 800,
            ...playerData
        });

        if (this.players.size >= 2 && this.gameState === 'waiting') {
            this.gameState = 'playing';
            this.roundStartTime = Date.now();
        }

        return true;
    }

    getSpawnPoint(team) {
        const spawnPoints = team === 'ct' ? this.map.spawnPoints.ct :
                          team === 't' ? this.map.spawnPoints.t :
                          [...this.map.spawnPoints.ct, ...this.map.spawnPoints.t];
        
        if (spawnPoints.length === 0) {
            return { x: 100 + Math.random() * (this.map.width - 200),
                    y: 100 + Math.random() * (this.map.height - 200) };
        }
        
        return spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
    }

    addSpectator(socketId, playerData) {
        return this.addPlayer(socketId, playerData, true);
    }

    removeSpectator(socketId) {
        this.spectators.delete(socketId);
    }

    addChatMessage(playerId, message, type = 'all') {
        const player = this.players.get(playerId) || this.spectators.get(playerId);
        if (!player) return;

        const chatMessage = {
            id: Date.now() + Math.random(),
            playerId: playerId,
            playerName: player.name,
            message: message.substring(0, 200), // Limit message length
            type: type, // 'all', 'team', 'dead'
            timestamp: Date.now()
        };

        this.chatMessages.push(chatMessage);
        
        // Keep only recent messages
        if (this.chatMessages.length > this.maxChatMessages) {
            this.chatMessages = this.chatMessages.slice(-this.maxChatMessages);
        }

        return chatMessage;
    }

    removePlayer(socketId) {
        this.players.delete(socketId);
        if (this.players.size === 0) {
            this.gameState = 'waiting';
        }
    }

    updatePlayer(socketId, updateData) {
        const player = this.players.get(socketId);
        if (player && player.alive) {
            Object.assign(player, updateData);
        }
    }

    addBullet(bulletData) {
        this.bullets.push({
            ...bulletData,
            id: Date.now() + Math.random(),
            createdAt: Date.now()
        });
    }

    update() {
        const now = Date.now();
        
        // Update bullet positions
        this.bullets.forEach(bullet => {
            bullet.x += Math.cos(bullet.angle) * bullet.speed * deltaTime;
            bullet.y += Math.sin(bullet.angle) * bullet.speed * deltaTime;
        });
        const deltaTime = (now - this.lastUpdate) / 1000;
        
        // Remove old bullets (after 3 seconds) or bullets that hit walls
        this.bullets = this.bullets.filter(bullet => {
            if (now - bullet.createdAt > 3000) return false;
            
            // Check wall collisions
            for (const wall of this.map.walls) {
                if (bullet.x >= wall.x && bullet.x <= wall.x + wall.width &&
                    bullet.y >= wall.y && bullet.y <= wall.y + wall.height) {
                    return false; // Remove bullet that hit wall
                }
            }
            
            // Check map boundaries
            if (bullet.x < 0 || bullet.x > this.map.width ||
                bullet.y < 0 || bullet.y > this.map.height) {
                return false;
            }
            
            return true;
        });
        
        // Check bullet-player collisions
        const bulletsToRemove = [];
        this.bullets.forEach((bullet, bulletIndex) => {
            this.players.forEach((player, playerId) => {
                if (bullet.owner !== playerId && player.alive && !bulletsToRemove.includes(bulletIndex)) {
                    const distance = Math.sqrt(
                        (bullet.x - player.x) ** 2 + (bullet.y - player.y) ** 2
                    );
                    
                    if (distance < 25) { // Slightly larger hit radius
                        // Hit!
                        player.health -= bullet.damage;
                        
                        // Broadcast hit event
                        io.to(this.id).emit('playerHit', {
                            playerId: playerId,
                            shooterId: bullet.owner,
                            damage: bullet.damage,
                            health: player.health,
                            x: player.x,
                            y: player.y
                        });
                        
                        if (player.health <= 0) {
                            player.health = 0;
                            player.alive = false;
                            
                            // Award points to shooter
                            const shooter = this.players.get(bullet.owner);
                            if (shooter) {
                                shooter.score += 100;
                                shooter.kills += 1;
                            }
                            
                            // Broadcast kill event
                            io.to(this.id).emit('playerKilled', {
                                playerId: playerId,
                                killerId: bullet.owner,
                                killerName: shooter ? shooter.name : 'Unknown',
                                victimName: player.name
                            });
                        }
                        
                        // Mark bullet for removal
                        bulletsToRemove.push(bulletIndex);
                    }
                }
            });
        });

        this.lastUpdate = now;
    }

    generateObstacles() {
        this.obstacles = [];
        
        // Create structured layouts instead of random placement
        const structures = [
            'corner_bunker',
            'center_pillar',
            'side_wall',
            'l_shaped_cover',
            'double_wall'
        ];
        
        const usedStructures = [];
        const count = 4 + Math.floor(Math.random() * 2); // 4-5 structures
        
        for (let i = 0; i < Math.min(count, structures.length); i++) {
            let structureType;
            do {
                structureType = structures[Math.floor(Math.random() * structures.length)];
            } while (usedStructures.includes(structureType));
            
            usedStructures.push(structureType);
            this.createStructure(structureType);
        }
    }

    createStructure(type) {
        const centerX = 400;
        const centerY = 300;
        
        switch (type) {
            case 'corner_bunker':
                const corner = Math.floor(Math.random() * 4);
                let bx, by;
                
                switch (corner) {
                    case 0: bx = 80; by = 80; break;
                    case 1: bx = 620; by = 80; break;
                    case 2: bx = 80; by = 420; break;
                    case 3: bx = 620; by = 420; break;
                }
                
                this.obstacles.push({ x: bx, y: by, width: 100, height: 20, type: 'wall' });
                this.obstacles.push({ x: bx, y: by, width: 20, height: 100, type: 'wall' });
                this.obstacles.push({ x: bx + 80, y: by + 80, width: 40, height: 40, type: 'box' });
                break;
                
            case 'center_pillar':
                const cx = centerX - 30 + (Math.random() - 0.5) * 100;
                const cy = centerY - 30 + (Math.random() - 0.5) * 100;
                
                this.obstacles.push({ x: cx, y: cy, width: 60, height: 60, type: 'circle' });
                this.obstacles.push({ x: cx - 40, y: cy + 20, width: 30, height: 30, type: 'box' });
                this.obstacles.push({ x: cx + 70, y: cy + 20, width: 30, height: 30, type: 'box' });
                break;
                
            case 'side_wall':
                const side = Math.floor(Math.random() * 4);
                let wx, wy, ww, wh;
                
                switch (side) {
                    case 0: wx = 200; wy = 60; ww = 200; wh = 20; break;
                    case 1: wx = 720; wy = 200; ww = 20; wh = 200; break;
                    case 2: wx = 400; wy = 520; ww = 200; wh = 20; break;
                    case 3: wx = 60; wy = 200; ww = 20; wh = 200; break;
                }
                
                this.obstacles.push({ x: wx, y: wy, width: ww, height: wh, type: 'wall' });
                if (side === 0 || side === 2) {
                    this.obstacles.push({ x: wx + ww - 40, y: wy - 20, width: 40, height: 60, type: 'box' });
                } else {
                    this.obstacles.push({ x: wx - 20, y: wy + wh - 40, width: 60, height: 40, type: 'box' });
                }
                break;
                
            case 'l_shaped_cover':
                const lx = 150 + Math.random() * 350;
                const ly = 150 + Math.random() * 200;
                
                this.obstacles.push({ x: lx, y: ly, width: 120, height: 20, type: 'wall' });
                this.obstacles.push({ x: lx, y: ly, width: 20, height: 120, type: 'wall' });
                this.obstacles.push({ x: lx + 100, y: ly + 100, width: 40, height: 40, type: 'circle' });
                break;
                
            case 'double_wall':
                const dwx = 200 + Math.random() * 300;
                const dwy = 150 + Math.random() * 200;
                
                this.obstacles.push({ x: dwx, y: dwy, width: 150, height: 20, type: 'wall' });
                this.obstacles.push({ x: dwx, y: dwy + 80, width: 150, height: 20, type: 'wall' });
                this.obstacles.push({ x: dwx + 130, y: dwy + 30, width: 40, height: 40, type: 'box' });
                break;
        }
    }

    obstaclesOverlap(a, b) {
        return !(a.x + a.width < b.x || b.x + b.width < a.x ||
                a.y + a.height < b.y || b.y + b.height < a.y);
    }

    getRandomSpawnPosition() {
        let attempts = 0;
        while (attempts < 50) {
            const x = 100 + Math.random() * 600;
            const y = 100 + Math.random() * 400;
            
            // Check if spawn position is clear of obstacles
            let clear = true;
            for (const obstacle of this.obstacles) {
                const distance = Math.sqrt(
                    Math.pow(x - (obstacle.x + obstacle.width/2), 2) +
                    Math.pow(y - (obstacle.y + obstacle.height/2), 2)
                );
                if (distance < 60) {
                    clear = false;
                    break;
                }
            }
            
            // Check if spawn position is clear of other players
            if (clear) {
                for (const [playerId, player] of this.players) {
                    const distance = Math.sqrt(
                        Math.pow(x - player.x, 2) + Math.pow(y - player.y, 2)
                    );
                    if (distance < 80) {
                        clear = false;
                        break;
                    }
                }
            }
            
            if (clear) {
                return { x, y };
            }
            attempts++;
        }
        
        // Fallback to center if no clear position found
        return { x: 400, y: 300 };
    }

    bulletHitsObstacle(bullet, obstacle) {
        switch (obstacle.type) {
            case 'circle':
                const centerX = obstacle.x + obstacle.width / 2;
                const centerY = obstacle.y + obstacle.height / 2;
                const radius = Math.min(obstacle.width, obstacle.height) / 2;
                const distance = Math.sqrt(
                    Math.pow(bullet.x - centerX, 2) + Math.pow(bullet.y - centerY, 2)
                );
                return distance <= radius;
            default: // box, wall
                return bullet.x >= obstacle.x && bullet.x <= obstacle.x + obstacle.width &&
                       bullet.y >= obstacle.y && bullet.y <= obstacle.y + obstacle.height;
        }
    }

    respawnPlayer(playerId) {
        const player = this.players.get(playerId);
        if (!player) return;

        const spawnPos = this.getRandomSpawnPosition();
        player.health = player.maxHealth;
        player.alive = true;
        player.x = spawnPos.x;
        player.y = spawnPos.y;
        player.weapon.ammo = player.weapon.maxAmmo;
        player.respawnTimer = 0;
    }

    getGameState() {
        return {
            players: Array.from(this.players.values()),
            spectators: Array.from(this.spectators.values()),
            bullets: this.bullets,
            obstacles: this.obstacles,
            gameState: this.gameState,
            gameMode: this.gameMode,
            roomId: this.id,
            map: this.map,
            currentRound: this.currentRound,
            ctScore: this.ctScore,
            tScore: this.tScore,
            roundTimeLeft: this.roundStartTime ?
                Math.max(0, this.roundTime - (Date.now() - this.roundStartTime)) : this.roundTime,
            chatMessages: this.chatMessages.slice(-10), // Send last 10 messages
            bombPlanted: this.bombPlanted,
            bombTimeLeft: this.bombPlanted ?
                Math.max(0, this.bombTimer - (Date.now() - this.bombPlantTime)) : 0
        };
    }
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    socket.on('joinRoom', (data) => {
        const { roomId, playerName, gameMode = 'deathmatch', asSpectator = false } = data;
        
        // Leave any existing room
        if (players.has(socket.id)) {
            const oldRoomId = players.get(socket.id).roomId;
            socket.leave(oldRoomId);
            if (gameRooms.has(oldRoomId)) {
                const oldRoom = gameRooms.get(oldRoomId);
                oldRoom.removePlayer(socket.id);
                oldRoom.removeSpectator(socket.id);
            }
        }

        // Create room if it doesn't exist
        if (!gameRooms.has(roomId)) {
            gameRooms.set(roomId, new GameRoom(roomId, gameMode));
        }

        const room = gameRooms.get(roomId);
        
        // Try to add player or spectator to room
        const success = asSpectator ?
            room.addSpectator(socket.id, { name: playerName }) :
            room.addPlayer(socket.id, { name: playerName });
        
        if (success) {
            socket.join(roomId);
            players.set(socket.id, { roomId, name: playerName, isSpectator: asSpectator });
            
            // Send initial game state to new player
            socket.emit('gameState', room.getGameState());
            
            // Notify other players
            socket.to(roomId).emit(asSpectator ? 'spectatorJoined' : 'playerJoined', {
                playerId: socket.id,
                playerName: playerName
            });
            
            console.log(`${asSpectator ? 'Spectator' : 'Player'} ${playerName} joined room ${roomId}`);
        } else {
            socket.emit('joinError', asSpectator ? 'Spectator slots full' : 'Room is full');
        }
    });

    socket.on('switchToSpectator', () => {
        const playerInfo = players.get(socket.id);
        if (!playerInfo || playerInfo.isSpectator) return;

        const room = gameRooms.get(playerInfo.roomId);
        if (!room) return;

        // Remove from players and add to spectators
        room.removePlayer(socket.id);
        const success = room.addSpectator(socket.id, { name: playerInfo.name });
        
        if (success) {
            playerInfo.isSpectator = true;
            socket.to(playerInfo.roomId).emit('playerBecameSpectator', {
                playerId: socket.id,
                playerName: playerInfo.name
            });
        }
    });

    socket.on('switchToPlayer', () => {
        const playerInfo = players.get(socket.id);
        if (!playerInfo || !playerInfo.isSpectator) return;

        const room = gameRooms.get(playerInfo.roomId);
        if (!room) return;

        // Remove from spectators and add to players
        room.removeSpectator(socket.id);
        const success = room.addPlayer(socket.id, { name: playerInfo.name });
        
        if (success) {
            playerInfo.isSpectator = false;
            socket.to(playerInfo.roomId).emit('spectatorBecamePlayer', {
                playerId: socket.id,
                playerName: playerInfo.name
            });
        } else {
            socket.emit('joinError', 'Cannot join game - room is full');
        }
    });

    socket.on('chatMessage', (data) => {
        const playerInfo = players.get(socket.id);
        if (!playerInfo) return;

        const room = gameRooms.get(playerInfo.roomId);
        if (!room) return;

        const chatMessage = room.addChatMessage(socket.id, data.message, data.type || 'all');
        
        if (chatMessage) {
            // Broadcast to appropriate recipients
            if (data.type === 'team') {
                const player = room.players.get(socket.id);
                if (player) {
                    // Send to team members only
                    room.players.forEach((p, id) => {
                        if (p.team === player.team) {
                            io.to(id).emit('chatMessage', chatMessage);
                        }
                    });
                }
            } else {
                // Send to all players and spectators in room
                io.to(playerInfo.roomId).emit('chatMessage', chatMessage);
            }
        }
    });

    socket.on('playerUpdate', (data) => {
        const playerInfo = players.get(socket.id);
        if (!playerInfo) return;

        const room = gameRooms.get(playerInfo.roomId);
        if (!room) return;

        room.updatePlayer(socket.id, data);
        
        // Broadcast player update to other players in the room
        socket.to(playerInfo.roomId).emit('playerUpdate', {
            playerId: socket.id,
            ...data
        });
    });

    socket.on('shoot', (data) => {
        const playerInfo = players.get(socket.id);
        if (!playerInfo) return;

        const room = gameRooms.get(playerInfo.roomId);
        if (!room) return;

        const player = room.players.get(socket.id);
        if (!player || !player.alive || player.weapon.ammo <= 0) return;

        // Consume ammo
        player.weapon.ammo--;
        player.weapon.lastShot = Date.now();

        // Create bullet
        const bullet = {
            x: data.x,
            y: data.y,
            angle: data.angle,
            speed: 500,
            damage: 25,
            owner: socket.id
        };

        room.addBullet(bullet);

        // Broadcast shot to all players in room
        io.to(playerInfo.roomId).emit('shot', {
            playerId: socket.id,
            bullet: bullet,
            ammo: player.weapon.ammo
        });
    });

    socket.on('reload', () => {
        const playerInfo = players.get(socket.id);
        if (!playerInfo) return;

        const room = gameRooms.get(playerInfo.roomId);
        if (!room) return;

        const player = room.players.get(socket.id);
        if (!player || !player.alive) return;

        const needed = player.weapon.maxAmmo - player.weapon.ammo;
        const available = Math.min(needed, player.weapon.reserveAmmo);

        player.weapon.ammo += available;
        player.weapon.reserveAmmo -= available;

        socket.emit('reloaded', {
            ammo: player.weapon.ammo,
            reserveAmmo: player.weapon.reserveAmmo
        });
    });

    socket.on('respawn', () => {
        const playerInfo = players.get(socket.id);
        if (!playerInfo) return;

        const room = gameRooms.get(playerInfo.roomId);
        if (!room) return;

        const player = room.players.get(socket.id);
        if (!player) return;

        // Get safe spawn point based on team
        const spawnPoint = room.getSpawnPoint(player.team);

        // Respawn player at safe location
        player.health = player.maxHealth;
        player.alive = true;
        player.x = spawnPoint.x;
        player.y = spawnPoint.y;
        player.weapon.ammo = player.weapon.maxAmmo;

        io.to(playerInfo.roomId).emit('playerRespawned', {
            playerId: socket.id,
            x: player.x,
            y: player.y,
            health: player.health
        });
    });

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        
        const playerInfo = players.get(socket.id);
        if (playerInfo) {
            const room = gameRooms.get(playerInfo.roomId);
            if (room) {
                room.removePlayer(socket.id);
                room.removeSpectator(socket.id);
                
                // Notify other players
                socket.to(playerInfo.roomId).emit('playerLeft', {
                    playerId: socket.id,
                    wasSpectator: playerInfo.isSpectator
                });

                // Clean up empty rooms
                if (room.players.size === 0 && room.spectators.size === 0) {
                    gameRooms.delete(playerInfo.roomId);
                }
            }
            players.delete(socket.id);
        }
    });
});

// Game loop - update all rooms
setInterval(() => {
    gameRooms.forEach((room) => {
        room.update();
        
        // Broadcast updated game state to all players in room
        if (room.players.size > 0) {
            io.to(room.id).emit('gameState', room.getGameState());
        }
    });
}, 1000 / 60); // 60 FPS

// API endpoints
app.get('/rooms', (req, res) => {
    const roomList = Array.from(gameRooms.values()).map(room => ({
        id: room.id,
        players: room.players.size,
        maxPlayers: room.maxPlayers,
        gameState: room.gameState
    }));
    res.json(roomList);
});

server.listen(PORT, () => {
    console.log(`Counter-Strike 1.6 Multiplayer Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} to play`);
});