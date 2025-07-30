// Game state and configuration
const Game = {
    canvas: null,
    ctx: null,
    width: 800,
    height: 600,
    state: 'menu', // menu, playing, paused, gameOver
    mode: 'singleplayer', // singleplayer, multiplayer
    lastTime: 0,
    deltaTime: 0,
    
    // Multiplayer
    socket: null,
    isMultiplayer: false,
    playerId: null,
    roomId: null,
    playerName: '',
    
    // Game objects
    player: null,
    otherPlayers: new Map(),
    enemies: [],
    bullets: [],
    particles: [],
    
    // Input handling
    keys: {},
    mouse: { x: 0, y: 0, clicked: false },
    
    // Game stats
    score: 0,
    level: 1,
    enemiesKilled: 0
};

// Player class
class Player {
    constructor(x, y, isLocal = true, team = 'ct') {
        this.x = x;
        this.y = y;
        this.width = 20;
        this.height = 20;
        this.speed = 200;
        this.health = 100;
        this.maxHealth = 100;
        this.angle = 0;
        this.team = team; // 'ct' (Counter-Terrorists) or 't' (Terrorists)
        this.alive = true;
        this.isLocal = isLocal;
        this.name = '';
        this.score = 0;
        this.weapon = {
            ammo: 30,
            maxAmmo: 30,
            reserveAmmo: 90,
            fireRate: 150, // ms between shots
            lastShot: 0,
            damage: 25,
            range: 400
        };
    }
    
    update(deltaTime) {
        if (!this.isLocal || !this.alive) return;
        
        // Movement
        let dx = 0, dy = 0;
        
        if (Game.keys['w'] || Game.keys['W']) dy -= 1;
        if (Game.keys['s'] || Game.keys['S']) dy += 1;
        if (Game.keys['a'] || Game.keys['A']) dx -= 1;
        if (Game.keys['d'] || Game.keys['D']) dx += 1;
        
        // Normalize diagonal movement
        if (dx !== 0 && dy !== 0) {
            dx *= 0.707;
            dy *= 0.707;
        }
        
        // Apply movement
        const newX = this.x + dx * this.speed * deltaTime;
        const newY = this.y + dy * this.speed * deltaTime;
        
        // Keep player in bounds
        this.x = Math.max(this.width/2, Math.min(Game.width - this.width/2, newX));
        this.y = Math.max(this.height/2, Math.min(Game.height - this.height/2, newY));
        
        // Calculate angle to mouse
        this.angle = Math.atan2(Game.mouse.y - this.y, Game.mouse.x - this.x);
        
        // Send position update to server if multiplayer
        if (Game.isMultiplayer && Game.socket) {
            Game.socket.emit('playerUpdate', {
                x: this.x,
                y: this.y,
                angle: this.angle,
                health: this.health,
                alive: this.alive
            });
        }
        
        // Shooting
        if (Game.mouse.clicked && this.canShoot()) {
            this.shoot();
        }
        
        // Reload
        if (Game.keys['r'] || Game.keys['R']) {
            this.reload();
        }
    }
    
    canShoot() {
        return this.weapon.ammo > 0 && 
               Date.now() - this.weapon.lastShot > this.weapon.fireRate;
    }
    
    shoot() {
        if (!this.canShoot()) return;
        
        this.weapon.ammo--;
        this.weapon.lastShot = Date.now();
        
        const bulletX = this.x + Math.cos(this.angle) * 25;
        const bulletY = this.y + Math.sin(this.angle) * 25;
        
        if (Game.isMultiplayer && Game.socket) {
            // Send shoot event to server
            Game.socket.emit('shoot', {
                x: bulletX,
                y: bulletY,
                angle: this.angle
            });
        } else {
            // Single player - create bullet locally
            const bullet = new Bullet(
                bulletX,
                bulletY,
                this.angle,
                this.weapon.damage,
                this.weapon.range,
                'player'
            );
            Game.bullets.push(bullet);
        }
        
        // Create muzzle flash particle
        for (let i = 0; i < 5; i++) {
            const particle = new Particle(
                bulletX,
                bulletY,
                Math.random() * Math.PI * 2,
                100 + Math.random() * 100,
                '#ffff00',
                200
            );
            Game.particles.push(particle);
        }
    }
    
    reload() {
        if (this.weapon.ammo === this.weapon.maxAmmo || this.weapon.reserveAmmo === 0) return;
        
        if (Game.isMultiplayer && Game.socket) {
            Game.socket.emit('reload');
        } else {
            const needed = this.weapon.maxAmmo - this.weapon.ammo;
            const available = Math.min(needed, this.weapon.reserveAmmo);
            
            this.weapon.ammo += available;
            this.weapon.reserveAmmo -= available;
        }
    }
    
    takeDamage(damage) {
        this.health -= damage;
        if (this.health <= 0) {
            this.health = 0;
            this.alive = false;
            if (!Game.isMultiplayer) {
                Game.state = 'gameOver';
            }
        }
    }
    
    respawn() {
        this.health = this.maxHealth;
        this.alive = true;
        this.weapon.ammo = this.weapon.maxAmmo;
        
        if (Game.isMultiplayer && Game.socket) {
            Game.socket.emit('respawn');
        }
    }
    
    draw(ctx) {
        if (!this.alive) return;
        
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        
        // Draw player body with team colors
        if (this.team === 'ct') {
            ctx.fillStyle = this.isLocal ? '#0066cc' : '#0088ff';
        } else {
            ctx.fillStyle = this.isLocal ? '#cc6600' : '#ff8800';
        }
        ctx.fillRect(-this.width/2, -this.height/2, this.width, this.height);
        
        // Draw weapon
        ctx.fillStyle = '#333';
        ctx.fillRect(0, -3, 25, 6);
        
        // Draw direction indicator
        ctx.fillStyle = '#fff';
        ctx.fillRect(this.width/2 - 2, -2, 4, 4);
        
        ctx.restore();
        
        // Draw name tag for other players
        if (!this.isLocal && this.name) {
            ctx.fillStyle = '#fff';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(this.name, this.x, this.y - 25);
        }
        
        // Draw health bar for other players
        if (!this.isLocal) {
            const healthPercent = this.health / this.maxHealth;
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(this.x - this.width/2, this.y - this.height/2 - 8, this.width, 3);
            ctx.fillStyle = '#00ff00';
            ctx.fillRect(this.x - this.width/2, this.y - this.height/2 - 8, this.width * healthPercent, 3);
        }
    }
}

// Enemy class (for single player)
class Enemy {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 18;
        this.height = 18;
        this.speed = 80 + Math.random() * 40;
        this.health = 50;
        this.maxHealth = 50;
        this.angle = 0;
        this.lastShot = 0;
        this.fireRate = 1000 + Math.random() * 1000;
        this.damage = 15;
        this.detectionRange = 300;
        this.shootRange = 250;
    }
    
    update(deltaTime) {
        const dx = Game.player.x - this.x;
        const dy = Game.player.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        this.angle = Math.atan2(dy, dx);
        
        // Move towards player if in detection range
        if (distance < this.detectionRange && distance > 50) {
            this.x += Math.cos(this.angle) * this.speed * deltaTime;
            this.y += Math.sin(this.angle) * this.speed * deltaTime;
        }
        
        // Shoot at player if in range
        if (distance < this.shootRange && Date.now() - this.lastShot > this.fireRate) {
            this.shoot();
        }
    }
    
    shoot() {
        this.lastShot = Date.now();
        
        const bullet = new Bullet(
            this.x + Math.cos(this.angle) * 20,
            this.y + Math.sin(this.angle) * 20,
            this.angle,
            this.damage,
            300,
            'enemy'
        );
        Game.bullets.push(bullet);
    }
    
    takeDamage(damage) {
        this.health -= damage;
        if (this.health <= 0) {
            Game.score += 100;
            Game.enemiesKilled++;
            return true; // Enemy is dead
        }
        return false;
    }
    
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        
        // Draw enemy body
        ctx.fillStyle = '#cc0000';
        ctx.fillRect(-this.width/2, -this.height/2, this.width, this.height);
        
        // Draw weapon
        ctx.fillStyle = '#666';
        ctx.fillRect(0, -2, 20, 4);
        
        // Draw health bar
        ctx.restore();
        const healthPercent = this.health / this.maxHealth;
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(this.x - this.width/2, this.y - this.height/2 - 8, this.width, 3);
        ctx.fillStyle = '#00ff00';
        ctx.fillRect(this.x - this.width/2, this.y - this.height/2 - 8, this.width * healthPercent, 3);
    }
}

// Bullet class
class Bullet {
    constructor(x, y, angle, damage, range, owner) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.speed = 500;
        this.damage = damage;
        this.range = range;
        this.owner = owner;
        this.traveled = 0;
        this.width = 4;
        this.height = 2;
    }
    
    update(deltaTime) {
        const moveDistance = this.speed * deltaTime;
        this.x += Math.cos(this.angle) * moveDistance;
        this.y += Math.sin(this.angle) * moveDistance;
        this.traveled += moveDistance;
        
        return this.traveled < this.range && 
               this.x >= 0 && this.x <= Game.width && 
               this.y >= 0 && this.y <= Game.height;
    }
    
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        
        ctx.fillStyle = this.owner === 'player' ? '#ffff00' : '#ff6600';
        ctx.fillRect(-this.width/2, -this.height/2, this.width, this.height);
        
        ctx.restore();
    }
}

// Particle class for visual effects
class Particle {
    constructor(x, y, angle, speed, color, life) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.speed = speed;
        this.color = color;
        this.life = life;
        this.maxLife = life;
        this.size = 2 + Math.random() * 3;
    }
    
    update(deltaTime) {
        this.x += Math.cos(this.angle) * this.speed * deltaTime;
        this.y += Math.sin(this.angle) * this.speed * deltaTime;
        this.life -= deltaTime * 1000;
        this.speed *= 0.98; // Slow down over time
        
        return this.life > 0;
    }
    
    draw(ctx) {
        const alpha = this.life / this.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x - this.size/2, this.y - this.size/2, this.size, this.size);
        ctx.restore();
    }
}

// Multiplayer functions
function initMultiplayer() {
    if (typeof io === 'undefined') {
        document.getElementById('connectionStatus').textContent = 'Socket.IO not available. Please run the server.';
        return false;
    }
    
    Game.socket = io();
    
    Game.socket.on('connect', () => {
        console.log('Connected to server');
        document.getElementById('connectionStatus').textContent = 'Connected to server';
    });
    
    Game.socket.on('disconnect', () => {
        console.log('Disconnected from server');
        document.getElementById('connectionStatus').textContent = 'Disconnected from server';
    });
    
    Game.socket.on('gameState', (gameState) => {
        // Update other players
        Game.otherPlayers.clear();
        gameState.players.forEach(playerData => {
            if (playerData.id !== Game.socket.id) {
                const otherPlayer = new Player(playerData.x, playerData.y, false, playerData.team);
                otherPlayer.health = playerData.health;
                otherPlayer.alive = playerData.alive;
                otherPlayer.angle = playerData.angle;
                otherPlayer.name = playerData.name;
                otherPlayer.score = playerData.score;
                Game.otherPlayers.set(playerData.id, otherPlayer);
            } else {
                // Update local player from server
                if (Game.player) {
                    Game.player.health = playerData.health;
                    Game.player.alive = playerData.alive;
                    Game.player.score = playerData.score;
                    Game.player.weapon.ammo = playerData.weapon.ammo;
                    Game.player.weapon.reserveAmmo = playerData.weapon.reserveAmmo;
                }
            }
        });
        
        // Update multiplayer UI
        document.getElementById('playerCountText').textContent = gameState.players.length;
        document.getElementById('roomIdText').textContent = gameState.roomId;
    });
    
    Game.socket.on('playerUpdate', (data) => {
        const player = Game.otherPlayers.get(data.playerId);
        if (player) {
            player.x = data.x;
            player.y = data.y;
            player.angle = data.angle;
            player.health = data.health;
            player.alive = data.alive;
        }
    });
    
    Game.socket.on('shot', (data) => {
        // Create bullet from other player's shot
        const bullet = new Bullet(
            data.bullet.x,
            data.bullet.y,
            data.bullet.angle,
            data.bullet.damage,
            400,
            data.playerId
        );
        Game.bullets.push(bullet);
        
        // Create muzzle flash
        for (let i = 0; i < 3; i++) {
            const particle = new Particle(
                data.bullet.x,
                data.bullet.y,
                Math.random() * Math.PI * 2,
                50 + Math.random() * 50,
                '#ffff00',
                150
            );
            Game.particles.push(particle);
        }
    });
    
    Game.socket.on('reloaded', (data) => {
        if (Game.player) {
            Game.player.weapon.ammo = data.ammo;
            Game.player.weapon.reserveAmmo = data.reserveAmmo;
        }
    });
    
    Game.socket.on('playerRespawned', (data) => {
        if (data.playerId === Game.socket.id && Game.player) {
            Game.player.x = data.x;
            Game.player.y = data.y;
            Game.player.health = data.health;
            Game.player.alive = true;
        }
    });
    
    Game.socket.on('joinError', (message) => {
        document.getElementById('connectionStatus').textContent = 'Error: ' + message;
    });
    
    return true;
}

// Game initialization
function init() {
    Game.canvas = document.getElementById('gameCanvas');
    Game.ctx = Game.canvas.getContext('2d');
    
    // Set up event listeners
    setupEventListeners();
    
    // Start game loop
    requestAnimationFrame(gameLoop);
}

function setupEventListeners() {
    // Menu buttons
    document.getElementById('startSinglePlayer').addEventListener('click', () => {
        Game.mode = 'singleplayer';
        startSinglePlayerGame();
    });
    
    document.getElementById('startMultiplayer').addEventListener('click', () => {
        Game.mode = 'multiplayer';
        showScreen('multiplayerMenu');
    });
    
    document.getElementById('instructions').addEventListener('click', showInstructions);
    document.getElementById('backToMenu').addEventListener('click', showMenu);
    document.getElementById('backToMainMenu2').addEventListener('click', showMenu);
    document.getElementById('playAgain').addEventListener('click', () => {
        if (Game.mode === 'singleplayer') {
            startSinglePlayerGame();
        } else {
            startMultiplayerGame();
        }
    });
    document.getElementById('backToMainMenu').addEventListener('click', showMenu);
    
    // Multiplayer buttons
    document.getElementById('joinGame').addEventListener('click', startMultiplayerGame);
    
    // Keyboard events
    document.addEventListener('keydown', (e) => {
        Game.keys[e.key] = true;
        
        if (e.key === 'Escape') {
            if (Game.state === 'playing') {
                Game.state = 'paused';
            } else if (Game.state === 'paused') {
                Game.state = 'playing';
            }
        }
        
        // Respawn in multiplayer
        if (e.key === ' ' && Game.isMultiplayer && Game.player && !Game.player.alive) {
            Game.player.respawn();
        }
    });
    
    document.addEventListener('keyup', (e) => {
        Game.keys[e.key] = false;
    });
    
    // Mouse events
    Game.canvas.addEventListener('mousemove', (e) => {
        const rect = Game.canvas.getBoundingClientRect();
        Game.mouse.x = e.clientX - rect.left;
        Game.mouse.y = e.clientY - rect.top;
    });
    
    Game.canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) { // Left click
            Game.mouse.clicked = true;
        }
    });
    
    Game.canvas.addEventListener('mouseup', (e) => {
        if (e.button === 0) {
            Game.mouse.clicked = false;
        }
    });
    
    // Prevent context menu on right click
    Game.canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });
}

function startSinglePlayerGame() {
    Game.state = 'playing';
    Game.isMultiplayer = false;
    Game.score = 0;
    Game.level = 1;
    Game.enemiesKilled = 0;
    
    // Initialize player
    Game.player = new Player(Game.width / 2, Game.height / 2, true);
    
    // Clear arrays
    Game.otherPlayers.clear();
    Game.enemies = [];
    Game.bullets = [];
    Game.particles = [];
    
    // Spawn initial enemies
    spawnEnemies(3);
    
    // Show game screen
    showScreen('gameScreen');
    document.getElementById('multiplayerInfo').style.display = 'none';
    updateUI();
}

function startMultiplayerGame() {
    const playerName = document.getElementById('playerName').value.trim();
    const roomId = document.getElementById('roomId').value.trim() || 'room_' + Math.random().toString(36).substr(2, 9);
    
    if (!playerName) {
        document.getElementById('connectionStatus').textContent = 'Please enter your name';
        return;
    }
    
    if (!initMultiplayer()) {
        return;
    }
    
    Game.state = 'playing';
    Game.isMultiplayer = true;
    Game.playerName = playerName;
    Game.roomId = roomId;
    Game.score = 0;
    
    // Initialize local player
    Game.player = new Player(Game.width / 2, Game.height / 2, true);
    Game.player.name = playerName;
    
    // Clear arrays
    Game.enemies = [];
    Game.bullets = [];
    Game.particles = [];
    
    // Join multiplayer room
    Game.socket.emit('joinRoom', {
        roomId: roomId,
        playerName: playerName
    });
    
    // Show game screen
    showScreen('gameScreen');
    document.getElementById('multiplayerInfo').style.display = 'block';
    updateUI();
}

function spawnEnemies(count) {
    for (let i = 0; i < count; i++) {
        let x, y;
        do {
            x = Math.random() * Game.width;
            y = Math.random() * Game.height;
        } while (Math.sqrt((x - Game.player.x) ** 2 + (y - Game.player.y) ** 2) < 150);
        
        Game.enemies.push(new Enemy(x, y));
    }
}

function showMenu() {
    Game.state = 'menu';
    if (Game.socket) {
        Game.socket.disconnect();
        Game.socket = null;
    }
    Game.isMultiplayer = false;
    showScreen('gameMenu');
}

function showInstructions() {
    showScreen('instructionsScreen');
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

function updateUI() {
    if (Game.player) {
        // Update health
        const healthPercent = (Game.player.health / Game.player.maxHealth) * 100;
        document.getElementById('healthFill').style.width = healthPercent + '%';
        document.getElementById('healthText').textContent = Game.player.health;
        
        // Update ammo
        document.getElementById('ammoText').textContent = 
            `${Game.player.weapon.ammo}/${Game.player.weapon.reserveAmmo}`;
        
        // Update score
        document.getElementById('scoreText').textContent = Game.player.score || Game.score;
    }
}

function gameLoop(currentTime) {
    Game.deltaTime = (currentTime - Game.lastTime) / 1000;
    Game.lastTime = currentTime;
    
    if (Game.state === 'playing') {
        update(Game.deltaTime);
        render();
        updateUI();
    }
    
    requestAnimationFrame(gameLoop);
}

function update(deltaTime) {
    // Update player
    if (Game.player) {
        Game.player.update(deltaTime);
    }
    
    // Update enemies (single player only)
    if (!Game.isMultiplayer) {
        Game.enemies.forEach(enemy => {
            enemy.update(deltaTime);
        });
    }
    
    // Update bullets
    Game.bullets = Game.bullets.filter(bullet => {
        const alive = bullet.update(deltaTime);
        
        // Check collisions (single player only - server handles multiplayer collisions)
        if (!Game.isMultiplayer && bullet.owner === 'player') {
            // Check enemy collisions
            for (let i = Game.enemies.length - 1; i >= 0; i--) {
                const enemy = Game.enemies[i];
                if (Math.sqrt((bullet.x - enemy.x) ** 2 + (bullet.y - enemy.y) ** 2) < 15) {
                    if (enemy.takeDamage(bullet.damage)) {
                        Game.enemies.splice(i, 1);
                    }
                    return false; // Remove bullet
                }
            }
        } else if (!Game.isMultiplayer && bullet.owner === 'enemy') {
            // Check player collision
            if (Game.player && 
                Math.sqrt((bullet.x - Game.player.x) ** 2 + (bullet.y - Game.player.y) ** 2) < 15) {
                Game.player.takeDamage(bullet.damage);
                return false; // Remove bullet
            }
        }
        
        return alive;
    });
    
    // Update particles
    Game.particles = Game.particles.filter(particle => particle.update(deltaTime));
    
    // Spawn more enemies if all are dead (single player only)
    if (!Game.isMultiplayer && Game.enemies.length === 0) {
        Game.level++;
        spawnEnemies(2 + Game.level);
    }
    
    // Check game over (single player only)
    if (!Game.isMultiplayer && Game.player && Game.player.health <= 0) {
        Game.state = 'gameOver';
        document.getElementById('finalScoreText').textContent = Game.score;
        showScreen('gameOverScreen');
    }
}

function render() {
    const ctx = Game.ctx;
    
    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, Game.width, Game.height);
    
    // Draw grid pattern for map
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let x = 0; x < Game.width; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, Game.height);
        ctx.stroke();
    }
    for (let y = 0; y < Game.height; y += 50) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(Game.width, y);
        ctx.stroke();
    }
    
    // Draw game objects
    Game.particles.forEach(particle => particle.draw(ctx));
    Game.bullets.forEach(bullet => bullet.draw(ctx));
    
    // Draw enemies (single player only)
    if (!Game.isMultiplayer) {
        Game.enemies.forEach(enemy => enemy.draw(ctx));
    }
    
    // Draw other players (multiplayer only)
    if (Game.isMultiplayer) {
        Game.otherPlayers.forEach(player => player.draw(ctx));
    }
    
    // Draw local player
    if (Game.player) {
        Game.player.draw(ctx);
    }
    
    // Draw crosshair
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(Game.mouse.x - 10, Game.mouse.y);
    ctx.lineTo(Game.mouse.x + 10, Game.mouse.y);
    ctx.moveTo(Game.mouse.x, Game.mouse.y - 10);
    ctx.lineTo(Game.mouse.x, Game.mouse.y + 10);
    ctx.stroke();
    
    // Draw respawn message for multiplayer
    if (Game.isMultiplayer && Game.player && !Game.player.alive) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, Game.width, Game.height);
        
        ctx.fillStyle = '#fff';
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('You are dead! Press SPACE to respawn', Game.width / 2, Game.height / 2);
    }
}

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', init);