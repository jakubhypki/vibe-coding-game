// Player class
class Player {
    constructor(x, y, isLocal = true, team = 'ct') {
        this.x = x;
        this.y = y;
        this.width = 50;
        this.height = 50;
        this.speed = 200;
        this.health = 100;
        this.maxHealth = 100;
        this.angle = 0;
        this.team = team; // 'ct' (Counter-Terrorists), 't' (Terrorists), or 'dm' (Deathmatch)
        this.alive = true;
        this.isLocal = isLocal;
        this.name = '';
        this.score = 0;
        this.kills = 0;
        this.deaths = 0;
        this.money = 800;
        this.weapon = {
            ammo: 30,
            maxAmmo: 30,
            reserveAmmo: 90,
            fireRate: 150, // ms between shots
            lastShot: 0,
            damage: 25,
            range: 400,
            type: 'ak47'
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

        // Apply movement with collision detection
        const moveDistance = this.speed * deltaTime;
        const newX = this.x + dx * moveDistance;
        const newY = this.y + dy * moveDistance;

        // Check collision with walls
        if (this.canMoveTo(newX, this.y)) {
            this.x = newX;
        }
        if (this.canMoveTo(this.x, newY)) {
            this.y = newY;
        }

        // Calculate angle to mouse (using world coordinates)
        this.angle = Math.atan2(Game.mouse.worldY - this.y, Game.mouse.worldX - this.x);

        // Send position update to server if multiplayer
        if (Game.isMultiplayer && Game.socket && !Game.isSpectator) {
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

    canMoveTo(x, y) {
        const playerRect = {
            x: x - this.width / 2,
            y: y - this.height / 2,
            width: this.width,
            height: this.height
        };

        // Check collision with walls from infinite world
        const walls = getAllWalls();
        for (const wall of walls) {
            if (this.rectCollision(playerRect, wall)) {
                return false;
            }
        }

        // Check collision with cover objects
        const cover = getAllCover();
        for (const coverObj of cover) {
            if (this.rectCollision(playerRect, coverObj)) {
                return false;
            }
        }

        return true;
    }

    rectCollision(rect1, rect2) {
        return rect1.x < rect2.x + rect2.width &&
            rect1.x + rect1.width > rect2.x &&
            rect1.y < rect2.y + rect2.height &&
            rect1.y + rect1.height > rect2.y;
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
        ctx.translate(this.x - Game.camera.x, this.y - Game.camera.y);
        ctx.rotate(this.angle);

        // Draw player using texture or fallback to colored rectangle
        const textureName = this.team === 'ct' ? 'player_ct' :
            this.team === 't' ? 'player_t' : 'player_ct';

        if (window.TextureManager) {
            window.TextureManager.drawTexture(ctx, textureName,
                -this.width / 2, -this.height / 2, this.width, this.height);
        } else {
            // Fallback to colored rectangles
            if (this.team === 'ct') {
                ctx.fillStyle = this.isLocal ? '#0066cc' : '#0088ff';
            } else if (this.team === 't') {
                ctx.fillStyle = this.isLocal ? '#cc6600' : '#ff8800';
            } else {
                ctx.fillStyle = this.isLocal ? '#00cc66' : '#00ff88';
            }
            ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
        }

        // Draw weapon
        const weaponTexture = `weapon_${this.weapon.type}`;
        if (window.TextureManager) {
            window.TextureManager.drawTexture(ctx, weaponTexture, 0, -3, 25, 6);
        } else {
            ctx.fillStyle = '#333';
            ctx.fillRect(0, -3, 25, 6);
        }

        // Draw direction indicator
        ctx.fillStyle = '#fff';
        ctx.fillRect(this.width / 2 - 2, -2, 4, 4);

        ctx.restore();

        // Draw name tag for other players
        if (!this.isLocal && this.name) {
            ctx.fillStyle = '#fff';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.strokeText(this.name, this.x - Game.camera.x, this.y - Game.camera.y - 30);
            ctx.fillText(this.name, this.x - Game.camera.x, this.y - Game.camera.y - 30);
        }

        // Draw health bar for other players
        if (!this.isLocal) {
            const healthPercent = this.health / this.maxHealth;
            const screenX = this.x - Game.camera.x;
            const screenY = this.y - Game.camera.y;

            ctx.fillStyle = '#ff0000';
            ctx.fillRect(screenX - this.width / 2, screenY - this.height / 2 - 10, this.width, 4);
            ctx.fillStyle = '#00ff00';
            ctx.fillRect(screenX - this.width / 2, screenY - this.height / 2 - 10, this.width * healthPercent, 4);

            // Health bar border
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.strokeRect(screenX - this.width / 2, screenY - this.height / 2 - 10, this.width, 4);
        }
    }
}

// Enemy class (for single player)
class Enemy {
    constructor(x, y) {
        this.id = Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
        this.x = x;
        this.y = y;
        this.width = 80;
        this.height = 80;
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
        if (!Game.player) return;

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
        ctx.translate(this.x - Game.camera.x, this.y - Game.camera.y);
        ctx.rotate(this.angle);

        // Draw enemy body
        ctx.fillStyle = '#cc0000';
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);

        // Draw weapon
        ctx.fillStyle = '#666';
        ctx.fillRect(0, -2, 20, 4);

        ctx.restore();

        // Draw health bar
        const healthPercent = this.health / this.maxHealth;
        const screenX = this.x - Game.camera.x;
        const screenY = this.y - Game.camera.y;

        ctx.fillStyle = '#ff0000';
        ctx.fillRect(screenX - this.width / 2, screenY - this.height / 2 - 8, this.width, 3);
        ctx.fillStyle = '#00ff00';
        ctx.fillRect(screenX - this.width / 2, screenY - this.height / 2 - 8, this.width * healthPercent, 3);
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

        return this.traveled < this.range;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x - Game.camera.x, this.y - Game.camera.y);
        ctx.rotate(this.angle);

        ctx.fillStyle = this.owner === 'player' ? '#ffff00' : '#ff6600';
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);

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
        ctx.fillRect(this.x - Game.camera.x - this.size / 2, this.y - Game.camera.y - this.size / 2, this.size, this.size);
        ctx.restore();
    }
}