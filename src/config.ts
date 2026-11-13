// Central tuning constants for the M1 prototype.
// Keep everything tunable here so the "feel" can be iterated cheaply.

export const PALETTE = {
  bg: "#050510",
  grid: "#0b1030",
  gridLine: "rgba(5, 217, 232, 0.10)",
  player: "#05d9e8",
  playerGlow: "rgba(5, 217, 232, 0.55)",
  bullet: "#00f0ff",
  chaser: "#ff2a6d",
  chaserGlow: "rgba(255, 42, 109, 0.55)",
  splitter: "#ffb800",
  particle: "#00f0ff",
} as const;

// World
export const WORLD_MARGIN = 60; // keep entities inside canvas minus margin

// Player
export const PLAYER_RADIUS = 10;
export const PLAYER_SPEED = 300; // px / s
export const PLAYER_HIT_DEADZONE = 0.25; // right stick magnitude below this is idle
export const FIRE_RATE = 8; // shots / s while aiming

// Bullets
export const BULLET_SPEED = 620;
export const BULLET_RADIUS = 3;
export const BULLET_LIFE = 1.1; // seconds

// Chaser enemy
export const CHASER_RADIUS = 12;
export const CHASER_SPEED = 120;
export const CHASER_ACCEL = 260; // how hard it turns toward player
export const CHASER_HP = 1;

// Spawning
export const SPAWN_INTERVAL = 1.6; // seconds between spawns
export const MAX_ENEMIES = 6; // cap for M1
export const SPAWN_MIN_DIST = 240; // min distance from player at spawn

// Particle
export const PARTICLE_SPEED = 140;
export const PARTICLE_LIFE = 0.55;
export const KILL_PARTICLES = 14;

// Simulation
export const FIXED_DT = 1 / 120; // physics timestep
