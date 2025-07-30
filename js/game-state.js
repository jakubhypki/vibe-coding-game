// Game state and configuration
const Game = {
    canvas: null,
    ctx: null,
    width: 1200,
    height: 800,
    state: 'menu', // menu, playing, paused, gameOver
    mode: 'singleplayer', // singleplayer, multiplayer
    gameMode: 'deathmatch', // deathmatch, teamdeathmatch, defuse, hostage
    lastTime: 0,
    deltaTime: 0,
    
    // Camera system
    camera: {
        x: 0,
        y: 0,
        targetX: 0,
        targetY: 0,
        smoothing: 0.1,
        bounds: {
            minX: -2000,
            maxX: 2000,
            minY: -2000,
            maxY: 2000
        }
    },
    
    // World system for infinite generation
    world: {
        chunkSize: 400,
        loadedChunks: new Map(),
        generatedChunks: new Set(),
        loadDistance: 2 // chunks to load around player
    },
    
    // Multiplayer
    socket: null,
    isMultiplayer: false,
    isSpectator: false,
    playerId: null,
    roomId: null,
    playerName: '',
    chatVisible: false,
    
    // Game objects
    player: null,
    otherPlayers: new Map(),
    spectators: new Map(),
    enemies: [],
    bullets: [],
    particles: [],
    map: null,
    
    // Input handling
    keys: {},
    mouse: { x: 0, y: 0, clicked: false, worldX: 0, worldY: 0 },
    
    // Game stats
    score: 0,
    level: 1,
    enemiesKilled: 0,
    roundInfo: {
        current: 1,
        ctScore: 0,
        tScore: 0,
        timeLeft: 120000
    }
};