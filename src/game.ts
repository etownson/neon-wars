// The simulation: fixed-timestep update of all entities, spawning, collisions,
// and the kill counter. Pure state + update — no rendering here.
import * as cfg from "./config";
import { norm, v, Vec, clamp } from "./vec";
import type {
  Bullet,
  Chaser,
  Particle,
  Player,
  InputState,
} from "./types";

export class Game {
  player: Player;
  bullets: Bullet[] = [];
  chasers: Chaser[] = [];
  particles: Particle[] = [];
  kills = 0;
  time = 0;
  spawnTimer = 1.0;

  width: number;
  height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.player = {
      pos: v(width / 2, height / 2),
      radius: cfg.PLAYER_RADIUS,
      fireCooldown: 0,
      alive: true,
    };
  }

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.player.pos = v(clamp(this.player.pos.x, 0, w), clamp(this.player.pos.y, 0, h));
  }

  /** Advance simulation by one fixed step. */
  step(state: InputState, dt: number): void {
    this.time += dt;
    if (!this.player.alive) return;

    // 1. Move player from left stick
    const move = state.move;
    this.player.pos.x += move.x * cfg.PLAYER_SPEED * dt;
    this.player.pos.y += move.y * cfg.PLAYER_SPEED * dt;
    this.player.pos.x = clamp(this.player.pos.x, cfg.WORLD_MARGIN, this.width - cfg.WORLD_MARGIN);
    this.player.pos.y = clamp(this.player.pos.y, cfg.WORLD_MARGIN, this.height - cfg.WORLD_MARGIN);

    // 2. Auto-fire while right stick is deflected
    this.player.fireCooldown -= dt;
    const fireDelay = 1 / cfg.FIRE_RATE;
    if (state.firing && this.player.fireCooldown <= 0) {
      this.player.fireCooldown = fireDelay;
      const d = state.aimDir;
      this.bullets.push({
        pos: v(this.player.pos.x + d.x * (this.player.radius + cfg.BULLET_RADIUS),
               this.player.pos.y + d.y * (this.player.radius + cfg.BULLET_RADIUS)),
        vel: v(d.x * cfg.BULLET_SPEED, d.y * cfg.BULLET_SPEED),
        radius: cfg.BULLET_RADIUS,
        life: cfg.BULLET_LIFE,
      });
    }

    // 3. Spawn chasers
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.chasers.length < cfg.MAX_ENEMIES) {
      this.spawnChaser();
      this.spawnTimer = cfg.SPAWN_INTERVAL;
    }

    // 4. Update chasers (seek the player)
    for (const c of this.chasers) {
      const toPlayer = this.player.pos;
      const d = norm(v(toPlayer.x - c.pos.x, toPlayer.y - c.pos.y));
      // Steer velocity toward player, capped at max speed
      c.vel.x += d.x * cfg.CHASER_ACCEL * dt;
      c.vel.y += d.y * cfg.CHASER_ACCEL * dt;
      const sp = Math.hypot(c.vel.x, c.vel.y);
      if (sp > cfg.CHASER_SPEED) {
        c.vel.x = (c.vel.x / sp) * cfg.CHASER_SPEED;
        c.vel.y = (c.vel.y / sp) * cfg.CHASER_SPEED;
      }
      c.pos.x += c.vel.x * dt;
      c.pos.y += c.vel.y * dt;
      c.spin += dt * 3;
    }

    // 5. Update bullets
    for (const b of this.bullets) {
      b.pos.x += b.vel.x * dt;
      b.pos.y += b.vel.y * dt;
      b.life -= dt;
    }

    // 6. Update particles
    for (const p of this.particles) {
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.life -= dt;
    }

    // 7. Bullet vs chaser collision
    this.handleShots();

    // 8. Chaser vs player collision (death)
    const p = this.player;
    for (const c of this.chasers) {
      if (dist2(c.pos, p.pos) < (c.radius + p.radius) ** 2) {
        p.alive = false;
        break;
      }
    }

    // 9. Clean up dead bodies
    this.bullets = this.bullets.filter((b) => b.life > 0);
    this.chasers = this.chasers.filter((c) => c.hp > 0);
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  private spawnChaser(): void {
    // Pick a point on/near the arena edge, away from the player.
    let pos = v(0, 0);
    for (let tries = 0; tries < 8; tries++) {
      const side = Math.floor(Math.random() * 4);
      if (side === 0) pos = v(Math.random() * this.width, cfg.WORLD_MARGIN);
      else if (side === 1) pos = v(Math.random() * this.width, this.height - cfg.WORLD_MARGIN);
      else if (side === 2) pos = v(cfg.WORLD_MARGIN, Math.random() * this.height);
      else pos = v(this.width - cfg.WORLD_MARGIN, Math.random() * this.height);
      if (Math.hypot(pos.x - this.player.pos.x, pos.y - this.player.pos.y) > cfg.SPAWN_MIN_DIST) break;
    }
    this.chasers.push({
      pos,
      vel: v(0, 0),
      radius: cfg.CHASER_RADIUS,
      hp: cfg.CHASER_HP,
      spin: Math.random() * Math.PI * 2,
    });
  }

  private handleShots(): void {
    for (const ch of this.chasers) {
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i];
        if (ch.hp <= 0) break;
        if (dist2(b.pos, ch.pos) < (b.radius + ch.radius) ** 2) {
          this.bullets.splice(i, 1);
          ch.hp -= 1;
          if (ch.hp <= 0) {
            this.kills += 1;
            this.burst(ch.pos, cfg.PALETTE.chaser, cfg.KILL_PARTICLES);
          }
        }
      }
    }
  }

  private burst(origin: Vec, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = cfg.PARTICLE_SPEED * (0.4 + Math.random() * 1.2);
      this.particles.push({
        pos: v(origin.x, origin.y),
        vel: v(Math.cos(a) * sp, Math.sin(a) * sp),
        life: cfg.PARTICLE_LIFE * (0.5 + Math.random()),
        maxLife: cfg.PARTICLE_LIFE,
        size: 1.5 + Math.random() * 2.5,
        color,
      });
    }
  }
}

function dist2(a: Vec, b: Vec): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}
