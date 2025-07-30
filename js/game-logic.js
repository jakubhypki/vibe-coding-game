// Game initialization and main loop
function init() {
    Game.canvas = document.getElementById('gameCanvas');
    Game.ctx = Game.canvas.getContext('2d');
    
    // Initialize texture system
    initializeTextures();
    
    // Set up event listeners
    setupEventListeners();
    
    // Start game loop
    requestAnimationFrame(gameLoop);
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
    // Update world generation
    updateWorldGeneration();
    
    // Update camera
    updateCamera();
    
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
    
    // Check game over (single player only)
    if (!Game.isMultiplayer && Game.player && Game.player.health <= 0) {
        Game.state = 'gameOver';
        const finalScoreEl = document.getElementById('finalScoreText');
        if (finalScoreEl) finalScoreEl.textContent = Game.score;
        showScreen('gameOverScreen');
    }
}

function setupEventListeners() {
    // Menu buttons
    const startSinglePlayerBtn = document.getElementById('startSinglePlayer');
    if (startSinglePlayerBtn) {
        startSinglePlayerBtn.addEventListener('click', () => {
            Game.mode = 'singleplayer';
            startSinglePlayerGame();
        });
    }
    
    const startMultiplayerBtn = document.getElementById('startMultiplayer');
    if (startMultiplayerBtn) {
        startMultiplayerBtn.addEventListener('click', () => {
            Game.mode = 'multiplayer';
            showScreen('multiplayerMenu');
        });
    }
    
    const instructionsBtn = document.getElementById('instructions');
    if (instructionsBtn) instructionsBtn.addEventListener('click', showInstructions);
    
    const backToMenuBtn = document.getElementById('backToMenu');
    if (backToMenuBtn) backToMenuBtn.addEventListener('click', showMenu);
    
    const backToMainMenu2Btn = document.getElementById('backToMainMenu2');
    if (backToMainMenu2Btn) backToMainMenu2Btn.addEventListener('click', showMenu);
    
    const playAgainBtn = document.getElementById('playAgain');
    if (playAgainBtn) {
        playAgainBtn.addEventListener('click', () => {
            if (Game.mode === 'singleplayer') {
                startSinglePlayerGame();
            } else {
                startMultiplayerGame();
            }
        });
    }
    
    const backToMainMenuBtn = document.getElementById('backToMainMenu');
    if (backToMainMenuBtn) backToMainMenuBtn.addEventListener('click', showMenu);
    
    // Multiplayer buttons
    const joinGameBtn = document.getElementById('joinGame');
    if (joinGameBtn) joinGameBtn.addEventListener('click', startMultiplayerGame);
    
    // Spectator controls
    const switchToPlayerBtn = document.getElementById('switchToPlayer');
    if (switchToPlayerBtn) {
        switchToPlayerBtn.addEventListener('click', () => {
            if (Game.socket) {
                Game.socket.emit('switchToPlayer');
            }
        });
    }
    
    const switchToSpectatorBtn = document.getElementById('switchToSpectator');
    if (switchToSpectatorBtn) {
        switchToSpectatorBtn.addEventListener('click', () => {
            if (Game.socket) {
                Game.socket.emit('switchToSpectator');
            }
        });
    }
    
    // Chat system
    const sendChatBtn = document.getElementById('sendChat');
    if (sendChatBtn) sendChatBtn.addEventListener('click', sendChatMessage);
    
    const chatMessageInput = document.getElementById('chatMessageInput');
    if (chatMessageInput) {
        chatMessageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendChatMessage();
            }
        });
    }
    
    // Keyboard events
    document.addEventListener('keydown', (e) => {
        // Don't process game keys if chat is focused
        if (document.activeElement === document.getElementById('chatMessageInput')) {
            return;
        }
        
        Game.keys[e.key] = true;
        
        if (e.key === 'Escape') {
            if (Game.state === 'playing') {
                Game.state = 'paused';
            } else if (Game.state === 'paused') {
                Game.state = 'playing';
            }
        }
        
        // Toggle chat with Enter or T
        if ((e.key === 'Enter' || e.key === 't' || e.key === 'T') && Game.state === 'playing') {
            e.preventDefault();
            toggleChat();
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
    if (Game.canvas) {
        Game.canvas.addEventListener('mousemove', (e) => {
            const rect = Game.canvas.getBoundingClientRect();
            Game.mouse.x = e.clientX - rect.left;
            Game.mouse.y = e.clientY - rect.top;
            // World coordinates will be updated in updateCamera()
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
}

function startSinglePlayerGame() {
    Game.state = 'playing';
    Game.isMultiplayer = false;
    Game.isSpectator = false;
    Game.score = 0;
    Game.level = 1;
    Game.enemiesKilled = 0;
    
    // Reset world generation
    Game.world.loadedChunks.clear();
    Game.world.generatedChunks.clear();
    
    // Initialize player at a safe spawn position
    const safeSpawn = findSafeSpawnPosition(0, 0, 300);
    Game.player = new Player(safeSpawn.x, safeSpawn.y, true);
    
    // Reset camera
    Game.camera.x = -Game.width / 2;
    Game.camera.y = -Game.height / 2;
    Game.camera.targetX = -Game.width / 2;
    Game.camera.targetY = -Game.height / 2;
    
    // Clear arrays
    Game.otherPlayers.clear();
    Game.enemies = [];
    Game.bullets = [];
    Game.particles = [];
    
    // Show game screen
    showScreen('gameScreen');
    const multiplayerInfoEl = document.getElementById('multiplayerInfo');
    if (multiplayerInfoEl) multiplayerInfoEl.style.display = 'none';
    
    const chatContainerEl = document.getElementById('chatContainer');
    if (chatContainerEl) chatContainerEl.style.display = 'none';
    
    updateUI();
}

function startMultiplayerGame() {
    const playerNameInput = document.getElementById('playerName');
    const roomIdInput = document.getElementById('roomId');
    const gameModeSelect = document.getElementById('gameMode');
    const joinAsSpectatorCheckbox = document.getElementById('joinAsSpectator');
    
    if (!playerNameInput) return;
    
    const playerName = playerNameInput.value.trim();
    const roomId = roomIdInput ? (roomIdInput.value.trim() || 'room_' + Math.random().toString(36).substr(2, 9)) : 'default_room';
    const gameMode = gameModeSelect ? gameModeSelect.value : 'deathmatch';
    const asSpectator = joinAsSpectatorCheckbox ? joinAsSpectatorCheckbox.checked : false;
    
    if (!playerName) {
        const statusEl = document.getElementById('connectionStatus');
        if (statusEl) statusEl.textContent = 'Please enter your name';
        return;
    }
    
    if (!initMultiplayer()) {
        return;
    }
    
    Game.state = 'playing';
    Game.isMultiplayer = true;
    Game.isSpectator = asSpectator;
    Game.playerName = playerName;
    Game.roomId = roomId;
    Game.gameMode = gameMode;
    Game.score = 0;
    
    // Initialize local player only if not spectator
    if (!asSpectator) {
        const safeSpawn = findSafeSpawnPosition(0, 0, 300);
        Game.player = new Player(safeSpawn.x, safeSpawn.y, true);
        Game.player.name = playerName;
        
        // Reset camera to follow player
        Game.camera.x = safeSpawn.x - Game.width / 2;
        Game.camera.y = safeSpawn.y - Game.height / 2;
        Game.camera.targetX = safeSpawn.x - Game.width / 2;
        Game.camera.targetY = safeSpawn.y - Game.height / 2;
    }
    
    // Clear arrays
    Game.enemies = [];
    Game.bullets = [];
    Game.particles = [];
    
    // Join multiplayer room
    Game.socket.emit('joinRoom', {
        roomId: roomId,
        playerName: playerName,
        gameMode: gameMode,
        asSpectator: asSpectator
    });
    
    // Show game screen
    showScreen('gameScreen');
    const multiplayerInfoEl = document.getElementById('multiplayerInfo');
    if (multiplayerInfoEl) multiplayerInfoEl.style.display = 'block';
    
    const chatContainerEl = document.getElementById('chatContainer');
    if (chatContainerEl) chatContainerEl.style.display = 'block';
    
    const spectatorControlsEl = document.getElementById('spectatorControls');
    if (spectatorControlsEl) spectatorControlsEl.style.display = asSpectator ? 'block' : 'none';
    
    updateUI();
}

function showMenu() {
    Game.state = 'menu';
    if (Game.socket) {
        Game.socket.disconnect();
        Game.socket = null;
    }
    Game.isMultiplayer = false;
    Game.isSpectator = false;
    showScreen('gameMenu');
}

function showInstructions() {
    showScreen('instructionsScreen');
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) targetScreen.classList.add('active');
}

function updateUI() {
    if (Game.player && !Game.isSpectator) {
        // Update health
        const healthPercent = (Game.player.health / Game.player.maxHealth) * 100;
        const healthFillEl = document.getElementById('healthFill');
        const healthTextEl = document.getElementById('healthText');
        
        if (healthFillEl) healthFillEl.style.width = healthPercent + '%';
        if (healthTextEl) healthTextEl.textContent = Game.player.health;
        
        // Update ammo
        const ammoTextEl = document.getElementById('ammoText');
        if (ammoTextEl) {
            ammoTextEl.textContent = `${Game.player.weapon.ammo}/${Game.player.weapon.reserveAmmo}`;
        }
        
        // Update score
        const scoreTextEl = document.getElementById('scoreText');
        if (scoreTextEl) {
            scoreTextEl.textContent = Game.player.score || Game.score;
        }
    }
}

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', init);