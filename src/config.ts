// Central tuning constants for Neon Wars.
// Keep everything tunable here so the "feel" can be iterated cheaply.

export const PALETTE = {
  bg: "#050510",
  grid: "#0b1030",
  gridLine: "rgba(5, 217, 232, 0.10)",
  player: "#05d9e8",
  playerGlow: "rgba(5, 217, 232, 0.55)",
  bullet: "#00f0ff",
  enemyBullet: "#ff2a6d",
  // Enemy archetypes per design doc
  chaser: "#00f0ff",
  chaserGlow: "rgba(0, 240, 255, 0.55)",
  shooter: "#ff2a6d",
  shooterGlow: "rgba(255, 42, 109, 0.55)",
  splitter: "#ffb800",
  splitterGlow: "rgba(255, 184, 0, 0.55)",
  minion: "#05d9e8",
  blackhole: "#ff2a6d",
  blackholeCore: "#0a0a18",
  particle: "#00f0ff",
} as const;

// World
export const WORLD_MARGIN = 60; // keep entities inside canvas minus margin

// Player
export const PLAYER_RADIUS = 10;
export const PLAYER_SPEED = 600; // px / s top speed at full stick
// Exponential response rate (/s): how quickly velocity settles toward the stick target.
// Higher = snappier, lower = heavier. Time to 63% of target speed = 1 / PLAYER_RESPONSE s.
export const PLAYER_RESPONSE = 9;
// Combined speed ceiling (stick velocity + black-hole gravity) so a pull can't fling you.
export const PLAYER_MAX_SPEED = 660; // px / s
export const FIRE_RATE = 8; // shots / s while aiming

// Bullets
export const BULLET_SPEED = 620;
export const BULLET_RADIUS = 3;
export const BULLET_LIFE = 1.1; // seconds

// Chaser enemy
export const CHASER_RADIUS = 12;
export const CHASER_SPEED = 120;
export const CHASER_ACCEL = 260; // how hard it turns toward player

// Spawning
export const SPAWN_MIN_DIST = 240; // min distance from player at spawn

// Particle
export const PARTICLE_SPEED = 140;
export const PARTICLE_LIFE = 0.55;
export const KILL_PARTICLES = 14;

// Simulation
export const FIXED_DT = 1 / 240; // seconds per simulation step

// ---- M3: Wave / scaling ----

export const WAVE_TIME = 15; // seconds per wave

export const ENEMY_CAP_BASE = 4;

export const SPAWN_INTERVAL_BASE = 1.6;
export const SPAWN_INTERVAL_MIN = 0.45;
export const SPAWN_INTERVAL_STEP = 0.09; // faster spawning each wave

export const WAVE_SCALE_STEP = 0.05; // per-wave speed/fire-rate multiplier
export const WAVE_SCALE_MAX = 1.7;

// ---- Enemy archetypes ----

// Shooter
export const SHOOTER_RADIUS = 13;
export const SHOOTER_SPEED = 90; // lateral max speed
export const SHOOTER_ACCEL = 240;
export const SHOOTER_RANGE = 300; // preferred distance from player
export const SHOOTER_RANGE_TOLERANCE = 40;
export const SHOOTER_FIRE_INTERVAL = 2.1; // seconds between aimed bursts

export const ENEMY_BULLET_RADIUS = 4;
export const ENEMY_BULLET_SPEED = 210;
export const ENEMY_BULLET_LIFE = 4; // seconds

// Splitter
export const SPLITTER_RADIUS = 14;
export const SPLITTER_SPEED = 85;
export const SPLITTER_CHILDREN = 3;
export const MINION_RADIUS = 7;
export const MINION_SPEED = 190;
export const MINION_ACCEL = 420;

// Black hole
export const BLACKHOLE_RADIUS = 26;
export const BLACKHOLE_PULL_RADIUS = 280;
export const BLACKHOLE_PULL_STRENGTH = 775; // px/s^2  (620 * 1.25)
// How fast the player's accumulated pull decays when out of range (bigger = stickier).
export const PLAYER_GRAV_DAMP = 3; // per second
export const BLACKHOLE_LIFE = 9; // seconds then expires
export const BLACKHOLE_DRIFT = 16; // slow random drift speed

// ---- Scoring & multiplier ----

export const SCORE = {
  chaser: 100 as number,
  shooter: 150 as number,
  splitter: 250 as number,
  minion: 50 as number,
  blackhole: 0 as number,
};

export type ScoreKey = keyof typeof SCORE;

export const SPLIT_BONUS = 0.5; // +50% for triggering a splitter kill

export const MAX_MULTIPLIER = 20; // hard cap
// Curved multiplier: mult = 1 + floor((MAX-1) * (streak/FOR_MAX)^POWER)
export const MULT_STREAK_FOR_MAX = 50; // kills needed to reach the cap
export const MULT_CURVE_POWER = 0.9; // ~linear = steady climb, slower early gains

// ---- Respawn / death ----
export const RESPAWN_TIME = 1.0; // seconds dead before respawn
export const SPAWN_INVULN = 2.0; // seconds of invulnerability after respawn
export const DEATH_CLEAR_RADIUS = 220; // clear enemies near spawn on death

// ---- Juice ----
export const SHAKE_DECAY = 6; // how fast shake trauma decays (/s)
export const SHAKE_PX = 18; // max camera offset pixels at full trauma
export const SHAKE_FIRE = 0.025;
export const SHAKE_KILL = 0.12;
export const SHAKE_SPLIT = 0.3;
export const SHAKE_DEATH = 0.6;

export const HITSTOP_KILL = 0.03; // seconds

export const HITSTOP_SPLIT = 0.05;
export const HITSTOP_DEATH = 0.14;

// ---- Lives & game over ----
export const LIVES_START = 3;
export const LIVES_MAX = 6;

// ---- Bomb ----
export const BOMBS_START = 0;
export const BOMBS_MAX = 3;
export const BOMB_SHAKE = 1.0;
export const BOMB_HITSTOP = 0.12;
export const BOMB_FLASH = 1.0;

// ---- Spread rifle (timed power-up) ----
export const SPREAD_DURATION = 14; // seconds active

export const SPREAD_BULLETS = 5;
export const SPREAD_ANGLE = 0.9; // radians total fan width

// ---- Pickups ----
export const PICKUP_RADIUS = 12;
export const PICKUP_DESPAWN = 10; // seconds before a pickup fades
export const PICKUP_MAX_ON_FIELD = 4;
export const PICKUP_SPAWN_CHANCE = 0.08; // per destroy, chance to drop any pickup

export const HIGH_SCORE_KEY = "neon-wars-best";
