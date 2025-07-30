// Texture loading and management system
class TextureManager {
    constructor() {
        this.textures = new Map();
        this.loadingPromises = new Map();
        this.placeholderCanvas = this.createPlaceholderCanvas();
    }

    createPlaceholderCanvas() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        
        // Create a checkerboard pattern as default placeholder
        for (let x = 0; x < 64; x += 8) {
            for (let y = 0; y < 64; y += 8) {
                ctx.fillStyle = ((x + y) / 8) % 2 ? '#ff00ff' : '#ffffff';
                ctx.fillRect(x, y, 8, 8);
            }
        }
        
        return canvas;
    }

    async loadTexture(name, path) {
        if (this.textures.has(name)) {
            return this.textures.get(name);
        }

        if (this.loadingPromises.has(name)) {
            return this.loadingPromises.get(name);
        }

        const promise = new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                // Create canvas for the texture
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                
                this.textures.set(name, canvas);
                this.loadingPromises.delete(name);
                resolve(canvas);
            };
            img.onerror = () => {
                console.warn(`Failed to load texture: ${path}, using placeholder`);
                const placeholder = this.createColoredPlaceholder(name);
                this.textures.set(name, placeholder);
                this.loadingPromises.delete(name);
                resolve(placeholder);
            };
            img.src = path;
        });

        this.loadingPromises.set(name, promise);
        return promise;
    }

    createColoredPlaceholder(name) {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        
        // Different colors for different texture types
        let color = '#ff00ff'; // Default magenta
        
        if (name.includes('wall')) {
            color = '#8B4513'; // Brown for walls
        } else if (name.includes('floor')) {
            color = '#696969'; // Gray for floors
        } else if (name.includes('player')) {
            color = '#4169E1'; // Blue for players
        } else if (name.includes('weapon')) {
            color = '#2F4F4F'; // Dark gray for weapons
        } else if (name.includes('crate')) {
            color = '#D2691E'; // Orange for crates
        } else if (name.includes('barrel')) {
            color = '#8B0000'; // Dark red for barrels
        }
        
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 64, 64);
        
        // Add some texture pattern
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        for (let i = 0; i < 64; i += 4) {
            ctx.fillRect(i, 0, 1, 64);
            ctx.fillRect(0, i, 64, 1);
        }
        
        // Add label
        ctx.fillStyle = '#ffffff';
        ctx.font = '8px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(name.toUpperCase(), 32, 35);
        
        return canvas;
    }

    getTexture(name) {
        return this.textures.get(name) || this.placeholderCanvas;
    }

    async loadAllTextures() {
        const textureList = [
            // Wall textures
            { name: 'wall_concrete', path: 'textures/walls/concrete.png' },
            { name: 'wall_brick', path: 'textures/walls/brick.png' },
            { name: 'wall_metal', path: 'textures/walls/metal.png' },
            
            // Floor textures
            { name: 'floor_tiles', path: 'textures/floors/tiles.png' },
            { name: 'floor_concrete', path: 'textures/floors/concrete.png' },
            { name: 'floor_dirt', path: 'textures/floors/dirt.png' },
            
            // Player textures
            { name: 'player_ct', path: 'textures/players/ct.png' },
            { name: 'player_t', path: 'textures/players/terrorist.png' },
            
            // Weapon textures
            { name: 'weapon_ak47', path: 'textures/weapons/ak47.png' },
            { name: 'weapon_m4a1', path: 'textures/weapons/m4a1.png' },
            { name: 'weapon_awp', path: 'textures/weapons/awp.png' },
            
            // Object textures
            { name: 'crate_wood', path: 'textures/objects/crate.png' },
            { name: 'barrel_metal', path: 'textures/objects/barrel.png' },
            
            // UI textures
            { name: 'crosshair', path: 'textures/ui/crosshair.png' },
            { name: 'health_bar', path: 'textures/ui/health_bar.png' }
        ];

        const loadPromises = textureList.map(texture => 
            this.loadTexture(texture.name, texture.path)
        );

        try {
            await Promise.all(loadPromises);
            console.log('All textures loaded successfully');
        } catch (error) {
            console.error('Error loading textures:', error);
        }
    }

    drawTexture(ctx, textureName, x, y, width, height, angle = 0) {
        const texture = this.getTexture(textureName);
        
        ctx.save();
        
        if (angle !== 0) {
            ctx.translate(x + width/2, y + height/2);
            ctx.rotate(angle);
            ctx.translate(-width/2, -height/2);
            ctx.drawImage(texture, 0, 0, width, height);
        } else {
            ctx.drawImage(texture, x, y, width, height);
        }
        
        ctx.restore();
    }

    drawTiledTexture(ctx, textureName, x, y, width, height) {
        const texture = this.getTexture(textureName);
        const pattern = ctx.createPattern(texture, 'repeat');
        
        ctx.save();
        ctx.fillStyle = pattern;
        ctx.fillRect(x, y, width, height);
        ctx.restore();
    }
}

// Global texture manager instance
window.TextureManager = new TextureManager();