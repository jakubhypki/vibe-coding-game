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
        // Update map
        if (gameState.map) {
            Game.map = gameState.map;
        }
        
        // Update other players
        Game.otherPlayers.clear();
        if (gameState.players) {
            gameState.players.forEach(playerData => {
                if (playerData.id !== Game.socket.id) {
                    const otherPlayer = new Player(playerData.x, playerData.y, false, playerData.team);
                    otherPlayer.health = playerData.health;
                    otherPlayer.alive = playerData.alive;
                    otherPlayer.angle = playerData.angle;
                    otherPlayer.name = playerData.name;
                    otherPlayer.score = playerData.score;
                    otherPlayer.kills = playerData.kills || 0;
                    otherPlayer.deaths = playerData.deaths || 0;
                    if (playerData.weapon) {
                        otherPlayer.weapon = { ...otherPlayer.weapon, ...playerData.weapon };
                    }
                    Game.otherPlayers.set(playerData.id, otherPlayer);
                } else if (!Game.isSpectator) {
                    // Update local player from server
                    if (Game.player) {
                        Game.player.health = playerData.health;
                        Game.player.alive = playerData.alive;
                        Game.player.score = playerData.score;
                        Game.player.kills = playerData.kills || 0;
                        Game.player.deaths = playerData.deaths || 0;
                        Game.player.money = playerData.money || 800;
                        if (playerData.weapon) {
                            Game.player.weapon.ammo = playerData.weapon.ammo;
                            Game.player.weapon.reserveAmmo = playerData.weapon.reserveAmmo;
                        }
                    }
                }
            });
        }
        
        // Update spectators
        Game.spectators.clear();
        if (gameState.spectators) {
            gameState.spectators.forEach(spectatorData => {
                Game.spectators.set(spectatorData.id, spectatorData);
            });
        }
        
        // Update round info
        if (gameState.currentRound !== undefined) {
            Game.roundInfo.current = gameState.currentRound;
            Game.roundInfo.ctScore = gameState.ctScore || 0;
            Game.roundInfo.tScore = gameState.tScore || 0;
            Game.roundInfo.timeLeft = gameState.roundTimeLeft || 0;
        }
        
        // Update multiplayer UI
        updateMultiplayerUI(gameState);
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
    
    Game.socket.on('chatMessage', (data) => {
        addChatMessage(data);
    });
    
    Game.socket.on('joinError', (message) => {
        document.getElementById('connectionStatus').textContent = 'Error: ' + message;
    });
    
    return true;
}

function updateMultiplayerUI(gameState) {
    const playerCountEl = document.getElementById('playerCountText');
    const spectatorCountEl = document.getElementById('spectatorCountText');
    const roomIdEl = document.getElementById('roomIdText');
    const gameModeEl = document.getElementById('gameModeText');
    
    if (playerCountEl) playerCountEl.textContent = gameState.players ? gameState.players.length : 0;
    if (spectatorCountEl) spectatorCountEl.textContent = gameState.spectators ? gameState.spectators.length : 0;
    if (roomIdEl) roomIdEl.textContent = gameState.roomId || '-';
    if (gameModeEl) gameModeEl.textContent = gameState.gameMode || 'Unknown';
    
    // Update round UI
    if (gameState.gameMode !== 'deathmatch') {
        const roundInfoEl = document.getElementById('roundInfo');
        if (roundInfoEl) {
            roundInfoEl.style.display = 'block';
            
            const roundTextEl = document.getElementById('roundText');
            const ctScoreEl = document.getElementById('ctScoreText');
            const tScoreEl = document.getElementById('tScoreText');
            const roundTimeEl = document.getElementById('roundTimeText');
            
            if (roundTextEl) roundTextEl.textContent = Game.roundInfo.current;
            if (ctScoreEl) ctScoreEl.textContent = Game.roundInfo.ctScore;
            if (tScoreEl) tScoreEl.textContent = Game.roundInfo.tScore;
            
            if (roundTimeEl) {
                const minutes = Math.floor(Game.roundInfo.timeLeft / 60000);
                const seconds = Math.floor((Game.roundInfo.timeLeft % 60000) / 1000);
                roundTimeEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
        }
    }
}

// Chat system functions
function addChatMessage(messageData) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${messageData.type}`;
    
    const playerName = document.createElement('span');
    playerName.className = 'player-name';
    playerName.textContent = messageData.playerName + ': ';
    
    const messageText = document.createElement('span');
    messageText.className = 'message-text';
    messageText.textContent = messageData.message;
    
    messageDiv.appendChild(playerName);
    messageDiv.appendChild(messageText);
    chatMessages.appendChild(messageDiv);
    
    // Auto-scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Remove old messages if too many
    while (chatMessages.children.length > 50) {
        chatMessages.removeChild(chatMessages.firstChild);
    }
}

function sendChatMessage() {
    const messageInput = document.getElementById('chatMessageInput');
    const chatType = document.getElementById('chatType');
    
    if (!messageInput || !chatType) return;
    
    const message = messageInput.value.trim();
    
    if (message && Game.socket) {
        Game.socket.emit('chatMessage', {
            message: message,
            type: chatType.value
        });
        messageInput.value = '';
    }
}

function toggleChat() {
    const chatContainer = document.getElementById('chatContainer');
    if (!chatContainer) return;
    
    Game.chatVisible = !Game.chatVisible;
    chatContainer.style.display = Game.chatVisible ? 'block' : 'none';
    
    if (Game.chatVisible) {
        const chatInput = document.getElementById('chatMessageInput');
        if (chatInput) chatInput.focus();
    }
}