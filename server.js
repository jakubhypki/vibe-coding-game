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

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname)));

// Game state
const gameRooms = new Map();
const players = new Map();

class GameRoom {
    constructor(id) {
        this.id = id;
        this.players = new Map();
        this.bullets = [];
        this.gameState = 'waiting'; // waiting, playing, finished
        this.maxPlayers = 8;
        this.lastUpdate = Date.now();
    }

    addPlayer(socketId, playerData) {
        if (this.players.size >= this.maxPlayers) {
            return false;
        }

        this.players.set(socketId, {
            id: socketId,
            x: 100 + Math.random() * 600,
            y: 100 + Math.random() * 400,
            angle: 0,
            health: 100,
            maxHealth: 100,
            score: 0,
            weapon: {
                ammo: 30,
                maxAmmo: 30,
                reserveAmmo: 90,
                lastShot: 0
            },
            team: this.players.size % 2 === 0 ? 'ct' : 't', // Counter-Terrorists vs Terrorists
            alive: true,
            ...playerData
        });

        if (this.players.size >= 2 && this.gameState === 'waiting') {
            this.gameState = 'playing';
        }

        return true;
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
        
        // Remove old bullets (after 2 seconds)
        this.bullets = this.bullets.filter(bullet => now - bullet.createdAt < 2000);
        
        // Check bullet collisions
        this.bullets.forEach((bullet, bulletIndex) => {
            this.players.forEach((player, playerId) => {
                if (bullet.owner !== playerId && player.alive) {
                    const distance = Math.sqrt(
                        (bullet.x - player.x) ** 2 + (bullet.y - player.y) ** 2
                    );
                    
                    if (distance < 20) {
                        // Hit!
                        player.health -= bullet.damage;
                        
                        if (player.health <= 0) {
                            player.health = 0;
                            player.alive = false;
                            
                            // Award points to shooter
                            const shooter = this.players.get(bullet.owner);
                            if (shooter) {
                                shooter.score += 100;
                            }
                        }
                        
                        // Remove bullet
                        this.bullets.splice(bulletIndex, 1);
                    }
                }
            });
        });

        this.lastUpdate = now;
    }

    getGameState() {
        return {
            players: Array.from(this.players.values()),
            bullets: this.bullets,
            gameState: this.gameState,
            roomId: this.id
        };
    }
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    socket.on('joinRoom', (data) => {
        const { roomId, playerName } = data;
        
        // Leave any existing room
        if (players.has(socket.id)) {
            const oldRoomId = players.get(socket.id).roomId;
            socket.leave(oldRoomId);
            if (gameRooms.has(oldRoomId)) {
                gameRooms.get(oldRoomId).removePlayer(socket.id);
            }
        }

        // Create room if it doesn't exist
        if (!gameRooms.has(roomId)) {
            gameRooms.set(roomId, new GameRoom(roomId));
        }

        const room = gameRooms.get(roomId);
        
        // Try to add player to room
        const success = room.addPlayer(socket.id, { name: playerName });
        
        if (success) {
            socket.join(roomId);
            players.set(socket.id, { roomId, name: playerName });
            
            // Send initial game state to new player
            socket.emit('gameState', room.getGameState());
            
            // Notify other players
            socket.to(roomId).emit('playerJoined', {
                playerId: socket.id,
                playerName: playerName
            });
            
            console.log(`Player ${playerName} joined room ${roomId}`);
        } else {
            socket.emit('joinError', 'Room is full');
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

        // Respawn player
        player.health = player.maxHealth;
        player.alive = true;
        player.x = 100 + Math.random() * 600;
        player.y = 100 + Math.random() * 400;
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
                
                // Notify other players
                socket.to(playerInfo.roomId).emit('playerLeft', {
                    playerId: socket.id
                });

                // Clean up empty rooms
                if (room.players.size === 0) {
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