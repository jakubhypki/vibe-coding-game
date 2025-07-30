/**
 * Audio Manager for Counter-Strike 1.6 Web Game
 * Handles background music, sound effects, and audio controls
 */

class AudioManager {
    constructor() {
        this.sounds = new Map();
        this.music = new Map();
        this.currentMusic = null;
        this.masterVolume = 0.7;
        this.musicVolume = 0.5;
        this.sfxVolume = 0.8;
        this.isMuted = false;
        this.musicEnabled = true;
        this.sfxEnabled = true;
        
        // Initialize audio context for better browser compatibility
        this.audioContext = null;
        this.initAudioContext();
        
        // Load default sounds
        this.loadDefaultSounds();
        this.loadDefaultMusic();
        
        // Setup audio controls
        this.setupAudioControls();
    }
    
    initAudioContext() {
        try {
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();
        } catch (e) {
            console.warn('Web Audio API not supported');
        }
    }
    
    loadDefaultSounds() {
        // Define sound effects with fallback to generated audio
        const soundEffects = {
            'shoot_ak47': {
                url: 'audio/weapons/ak47_shot.mp3',
                fallback: () => this.generateGunshot(0.3, 150, 50)
            },
            'shoot_m4a1': {
                url: 'audio/weapons/m4a1_shot.mp3',
                fallback: () => this.generateGunshot(0.25, 180, 60)
            },
            'reload': {
                url: 'audio/weapons/reload.mp3',
                fallback: () => this.generateReload()
            },
            'footstep': {
                url: 'audio/player/footstep.mp3',
                fallback: () => this.generateFootstep()
            },
            'hit_player': {
                url: 'audio/player/hit.mp3',
                fallback: () => this.generateHit()
            },
            'player_death': {
                url: 'audio/player/death.mp3',
                fallback: () => this.generateDeath()
            },
            'bomb_plant': {
                url: 'audio/bomb/plant.mp3',
                fallback: () => this.generateBeep(800, 0.5)
            },
            'bomb_defuse': {
                url: 'audio/bomb/defuse.mp3',
                fallback: () => this.generateBeep(400, 1.0)
            },
            'round_start': {
                url: 'audio/round/start.mp3',
                fallback: () => this.generateRoundStart()
            },
            'round_end': {
                url: 'audio/round/end.mp3',
                fallback: () => this.generateRoundEnd()
            }
        };
        
        // Load each sound effect
        Object.entries(soundEffects).forEach(([name, config]) => {
            this.loadSound(name, config.url, config.fallback);
        });
    }
    
    loadDefaultMusic() {
        // Define background music tracks
        const musicTracks = {
            'menu_theme': {
                url: 'audio/music/menu_theme.mp3',
                loop: true,
                fallback: () => this.generateAmbientMusic(220, 'menu')
            },
            'round_music': {
                url: 'audio/music/round_music.mp3',
                loop: true,
                fallback: () => this.generateAmbientMusic(440, 'action')
            },
            'victory_music': {
                url: 'audio/music/victory.mp3',
                loop: false,
                fallback: () => this.generateVictoryMusic()
            },
            'defeat_music': {
                url: 'audio/music/defeat.mp3',
                loop: false,
                fallback: () => this.generateDefeatMusic()
            }
        };
        
        // Load each music track
        Object.entries(musicTracks).forEach(([name, config]) => {
            this.loadMusic(name, config.url, config.loop, config.fallback);
        });
    }
    
    loadSound(name, url, fallbackGenerator) {
        const audio = new Audio();
        audio.preload = 'auto';
        
        audio.addEventListener('canplaythrough', () => {
            console.log(`Sound loaded: ${name}`);
        });
        
        audio.addEventListener('error', () => {
            console.warn(`Failed to load sound: ${name}, using fallback`);
            if (fallbackGenerator) {
                this.sounds.set(name, fallbackGenerator());
            }
        });
        
        audio.src = url;
        this.sounds.set(name, audio);
    }
    
    loadMusic(name, url, loop = true, fallbackGenerator) {
        const audio = new Audio();
        audio.preload = 'auto';
        audio.loop = loop;
        
        audio.addEventListener('canplaythrough', () => {
            console.log(`Music loaded: ${name}`);
        });
        
        audio.addEventListener('error', () => {
            console.warn(`Failed to load music: ${name}, using fallback`);
            if (fallbackGenerator) {
                const fallbackAudio = fallbackGenerator();
                fallbackAudio.loop = loop;
                this.music.set(name, fallbackAudio);
            }
        });
        
        audio.src = url;
        this.music.set(name, audio);
    }
    
    playSound(name, volume = 1.0, pitch = 1.0) {
        if (!this.sfxEnabled || this.isMuted) return;
        
        const sound = this.sounds.get(name);
        if (!sound) {
            console.warn(`Sound not found: ${name}`);
            return;
        }
        
        try {
            // Clone audio for overlapping sounds
            const audioClone = sound.cloneNode();
            audioClone.volume = Math.min(1.0, this.masterVolume * this.sfxVolume * volume);
            audioClone.playbackRate = pitch;
            
            audioClone.play().catch(e => {
                console.warn(`Failed to play sound ${name}:`, e);
            });
            
            // Clean up after playing
            audioClone.addEventListener('ended', () => {
                audioClone.remove();
            });
        } catch (e) {
            console.warn(`Error playing sound ${name}:`, e);
        }
    }
    
    playMusic(name, fadeIn = true) {
        if (!this.musicEnabled || this.isMuted) return;
        
        const music = this.music.get(name);
        if (!music) {
            console.warn(`Music not found: ${name}`);
            return;
        }
        
        // Stop current music
        this.stopMusic(fadeIn);
        
        this.currentMusic = music;
        music.volume = fadeIn ? 0 : this.masterVolume * this.musicVolume;
        
        music.play().then(() => {
            if (fadeIn) {
                this.fadeInMusic(music);
            }
        }).catch(e => {
            console.warn(`Failed to play music ${name}:`, e);
        });
    }
    
    stopMusic(fadeOut = true) {
        if (!this.currentMusic) return;
        
        if (fadeOut) {
            this.fadeOutMusic(this.currentMusic);
        } else {
            this.currentMusic.pause();
            this.currentMusic.currentTime = 0;
        }
        
        this.currentMusic = null;
    }
    
    fadeInMusic(audio, duration = 2000) {
        const targetVolume = this.masterVolume * this.musicVolume;
        const steps = 50;
        const stepTime = duration / steps;
        const volumeStep = targetVolume / steps;
        
        let currentStep = 0;
        const fadeInterval = setInterval(() => {
            currentStep++;
            audio.volume = Math.min(targetVolume, volumeStep * currentStep);
            
            if (currentStep >= steps) {
                clearInterval(fadeInterval);
            }
        }, stepTime);
    }
    
    fadeOutMusic(audio, duration = 1000) {
        const startVolume = audio.volume;
        const steps = 50;
        const stepTime = duration / steps;
        const volumeStep = startVolume / steps;
        
        let currentStep = 0;
        const fadeInterval = setInterval(() => {
            currentStep++;
            audio.volume = Math.max(0, startVolume - (volumeStep * currentStep));
            
            if (currentStep >= steps) {
                clearInterval(fadeInterval);
                audio.pause();
                audio.currentTime = 0;
            }
        }, stepTime);
    }
    
    setMasterVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        this.updateAllVolumes();
    }
    
    setMusicVolume(volume) {
        this.musicVolume = Math.max(0, Math.min(1, volume));
        if (this.currentMusic) {
            this.currentMusic.volume = this.masterVolume * this.musicVolume;
        }
    }
    
    setSfxVolume(volume) {
        this.sfxVolume = Math.max(0, Math.min(1, volume));
    }
    
    toggleMute() {
        this.isMuted = !this.isMuted;
        this.updateAllVolumes();
        return this.isMuted;
    }
    
    toggleMusic() {
        this.musicEnabled = !this.musicEnabled;
        if (!this.musicEnabled && this.currentMusic) {
            this.stopMusic();
        }
        return this.musicEnabled;
    }
    
    toggleSfx() {
        this.sfxEnabled = !this.sfxEnabled;
        return this.sfxEnabled;
    }
    
    updateAllVolumes() {
        if (this.currentMusic) {
            this.currentMusic.volume = this.isMuted ? 0 : this.masterVolume * this.musicVolume;
        }
    }
    
    setupAudioControls() {
        // Create audio control panel
        const controlPanel = document.createElement('div');
        controlPanel.id = 'audio-controls';
        controlPanel.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 10px;
            border-radius: 5px;
            font-family: Arial, sans-serif;
            font-size: 12px;
            z-index: 1000;
            min-width: 200px;
        `;
        
        controlPanel.innerHTML = `
            <div style="margin-bottom: 10px; font-weight: bold;">Audio Controls</div>
            
            <div style="margin-bottom: 5px;">
                <label>Master Volume: <span id="master-vol-display">70%</span></label>
                <input type="range" id="master-volume" min="0" max="100" value="70" style="width: 100%;">
            </div>
            
            <div style="margin-bottom: 5px;">
                <label>Music Volume: <span id="music-vol-display">50%</span></label>
                <input type="range" id="music-volume" min="0" max="100" value="50" style="width: 100%;">
            </div>
            
            <div style="margin-bottom: 5px;">
                <label>SFX Volume: <span id="sfx-vol-display">80%</span></label>
                <input type="range" id="sfx-volume" min="0" max="100" value="80" style="width: 100%;">
            </div>
            
            <div style="margin-top: 10px;">
                <button id="toggle-mute" style="margin-right: 5px;">🔊 Mute</button>
                <button id="toggle-music" style="margin-right: 5px;">🎵 Music</button>
                <button id="toggle-sfx">🔫 SFX</button>
            </div>
        `;
        
        document.body.appendChild(controlPanel);
        
        // Setup event listeners
        this.setupControlListeners();
    }
    
    setupControlListeners() {
        // Master volume
        const masterVol = document.getElementById('master-volume');
        const masterDisplay = document.getElementById('master-vol-display');
        masterVol.addEventListener('input', (e) => {
            const value = e.target.value / 100;
            this.setMasterVolume(value);
            masterDisplay.textContent = `${e.target.value}%`;
        });
        
        // Music volume
        const musicVol = document.getElementById('music-volume');
        const musicDisplay = document.getElementById('music-vol-display');
        musicVol.addEventListener('input', (e) => {
            const value = e.target.value / 100;
            this.setMusicVolume(value);
            musicDisplay.textContent = `${e.target.value}%`;
        });
        
        // SFX volume
        const sfxVol = document.getElementById('sfx-volume');
        const sfxDisplay = document.getElementById('sfx-vol-display');
        sfxVol.addEventListener('input', (e) => {
            const value = e.target.value / 100;
            this.setSfxVolume(value);
            sfxDisplay.textContent = `${e.target.value}%`;
        });
        
        // Toggle buttons
        document.getElementById('toggle-mute').addEventListener('click', (e) => {
            const isMuted = this.toggleMute();
            e.target.textContent = isMuted ? '🔇 Unmute' : '🔊 Mute';
        });
        
        document.getElementById('toggle-music').addEventListener('click', (e) => {
            const enabled = this.toggleMusic();
            e.target.style.opacity = enabled ? '1' : '0.5';
        });
        
        document.getElementById('toggle-sfx').addEventListener('click', (e) => {
            const enabled = this.toggleSfx();
            e.target.style.opacity = enabled ? '1' : '0.5';
        });
    }
    
    // Procedural audio generation for fallbacks
    generateGunshot(volume = 0.3, frequency = 150, duration = 50) {
        if (!this.audioContext) return new Audio();
        
        const audio = new Audio();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Generate noise-based gunshot sound
        const sampleRate = 44100;
        const samples = Math.floor(sampleRate * duration / 1000);
        const buffer = new ArrayBuffer(44 + samples * 2);
        const view = new DataView(buffer);
        
        // WAV header
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };
        
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + samples * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, samples * 2, true);
        
        // Generate gunshot samples
        for (let i = 0; i < samples; i++) {
            const t = i / sampleRate;
            const envelope = Math.exp(-t * 10); // Quick decay
            const noise = (Math.random() - 0.5) * 2;
            const tone = Math.sin(2 * Math.PI * frequency * t);
            const sample = (noise * 0.7 + tone * 0.3) * envelope * volume * 32767;
            view.setInt16(44 + i * 2, sample, true);
        }
        
        const blob = new Blob([buffer], { type: 'audio/wav' });
        audio.src = URL.createObjectURL(blob);
        return audio;
    }
    
    generateFootstep() {
        return this.generateGunshot(0.1, 80, 100);
    }
    
    generateHit() {
        return this.generateGunshot(0.2, 200, 80);
    }
    
    generateDeath() {
        return this.generateGunshot(0.3, 100, 200);
    }
    
    generateReload() {
        return this.generateGunshot(0.15, 300, 150);
    }
    
    generateBeep(frequency, duration) {
        return this.generateTone(frequency, duration * 1000, 0.3);
    }
    
    generateTone(frequency, duration, volume) {
        if (!this.audioContext) return new Audio();
        
        const audio = new Audio();
        const sampleRate = 44100;
        const samples = Math.floor(sampleRate * duration / 1000);
        const buffer = new ArrayBuffer(44 + samples * 2);
        const view = new DataView(buffer);
        
        // WAV header (same as gunshot)
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };
        
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + samples * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, samples * 2, true);
        
        // Generate tone samples
        for (let i = 0; i < samples; i++) {
            const t = i / sampleRate;
            const sample = Math.sin(2 * Math.PI * frequency * t) * volume * 32767;
            view.setInt16(44 + i * 2, sample, true);
        }
        
        const blob = new Blob([buffer], { type: 'audio/wav' });
        audio.src = URL.createObjectURL(blob);
        return audio;
    }
    
    generateAmbientMusic(baseFreq, type) {
        // Generate simple ambient music
        return this.generateTone(baseFreq, 5000, 0.1);
    }
    
    generateRoundStart() {
        return this.generateTone(800, 500, 0.4);
    }
    
    generateRoundEnd() {
        return this.generateTone(400, 1000, 0.3);
    }
    
    generateVictoryMusic() {
        return this.generateTone(523, 2000, 0.2); // C note
    }
    
    generateDefeatMusic() {
        return this.generateTone(220, 2000, 0.2); // A note
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioManager;
}