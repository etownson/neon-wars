// Entity + state types shared across the simulation and renderer.
import type { Vec } from "./vec";

export interface Player {
  pos: Vec;
  radius: number;
  fireCooldown: number;
  alive: boolean;
}

export interface Bullet {
  pos: Vec;
  vel: Vec;
  radius: number;
  life: number;
}

export interface Chaser {
  pos: Vec;
  vel: Vec;
  radius: number;
  hp: number;
  spin: number; // cosmetic rotation
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
