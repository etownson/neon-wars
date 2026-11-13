// Entity + state types shared across the simulation and renderer.
import type { Vec } from "./vec";

export interface Player {
  pos: Vec;
  vel: Vec; // stick-driven momentum (accelerated toward target speed)
  grav: Vec; // accumulated gravity velocity from black holes
  radius: number;
  fireCooldown: number;
  facing: number; // radians
  alive: boolean;
  invuln: number; // remaining invulnerability seconds after respawn
  respawnTimer: number; // countdown while dead
}

export interface Bullet {
  pos: Vec;
  vel: Vec;
  radius: number;
  life: number;
}

export type EnemyKind = "chaser" | "shooter" | "splitter" | "blackhole" | "minion";

// A unified enemy: fields are only meaningful for the kinds that use them.
export interface Enemy {
  kind: EnemyKind;
  pos: Vec;
  vel: Vec;
  radius: number;
  hp: number;
  spin: number; // cosmetic rotation
  fireCooldown: number; // shooters
  life: number; // black holes count down to expiry
}

export interface Particle {
  pos: Vec;
  vel: Vec;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export interface InputState {
  move: Vec;
  firing: boolean;
  aimDir: Vec;
}
