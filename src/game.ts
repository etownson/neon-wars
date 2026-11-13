// The simulation: fixed-timestep update of all entities, wave-driven spawning,
// archetype behavior (chaser/shooter/splitter/black hole), scoring + multiplier,
// and collision. Pure state + update — no rendering here.
import * as cfg from "./config";
import { PALETTE, ScoreKey } from "./config";
import { norm, v, Vec, clamp } from "./vec";
import type { Bullet, Enemy, EnemyKind, Particle, Player, InputState } from "./types";
import type { Fx } from "./audio";

export class Game {
  player: Player;
  bullets: Bullet[] = [];
  enemyBullets: Bullet[] = [];
  enemies: Enemy[] = [];
  particles: Particle[] = [];

  score = 0;
  kills = 0;
  streak = 0;
  multiplier = 1;
  wave = 1;

  time = 0;
  waveTime = 0;
  spawnTimer = 1.0;

  shake = 0; // screen-shake trauma 0..1
  hitStop = 0; // seconds of simulation freeze

  width: number;
  height: number;
  private fx: Fx;

  constructor(width: number, height: number, fx: Fx = {}) {
    this.fx = fx;
    this.width = width;
    this.height = height;
    this.player = {
      pos: v(width / 2, height / 2),
      vel: v(0, 0),
      grav: v(0, 0),
      radius: cfg.PLAYER_RADIUS,
      fireCooldown: 0,
      facing: 0,
      alive: true,
      invuln: 0,
      respawnTimer: 0,
    };
  }

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.player.pos = v(clamp(this.player.pos.x, 0, w), clamp(this.player.pos.y, 0, h));
  }

  /** Dev helper: jump straight to a wave (clears the board) and revive the player. */
  setWave(n: number): void {
    this.wave = Math.max(1, Math.floor(n));
    this.waveTime = 0;
    this.enemies = [];
    this.enemyBullets = [];
    this.particles = [];
    const p = this.player;
    p.alive = true;
    p.pos = v(this.width / 2, this.height / 2);
    p.vel = v(0, 0);
    p.grav = v(0, 0);
    p.invuln = cfg.SPAWN_INVULN;
  }

  // ---- Main step ----

  step(state: InputState, dt: number): void {
    // Hit-stop: freeze the simulation briefly for impact, then resume.
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      return;
    }

    this.time += dt;
    this.shake = Math.max(0, this.shake - cfg.SHAKE_DECAY * dt);

    // Wave progression (time-based score-attack pacing).
    this.waveTime += dt;
    if (this.waveTime >= cfg.WAVE_TIME) {
      this.waveTime = 0;
      this.wave += 1;
    }

    const scale = this.waveScale();

    // Drive black-hole rumble from how many are currently live.
    let blackholes = 0;
    for (const e of this.enemies) if (e.kind === "blackhole") blackholes++;
    this.fx.setRumble?.(Math.min(1, blackholes));

    // Respawn handling.
    if (!this.player.alive) {
      this.player.respawnTimer -= dt;
      if (this.player.respawnTimer <= 0) this.respawn();
    } else {
      this.updatePlayer(state, dt);
      this.spawn(dt);
    }

    if (this.player.invuln > 0) this.player.invuln -= dt;

    this.updateEnemies(dt, scale);
    this.applyBlackholeGravity(dt);

    // Bullets.
    for (const b of this.bullets) {
      b.pos.x += b.vel.x * dt;
      b.pos.y += b.vel.y * dt;
      b.life -= dt;
    }
    for (const b of this.enemyBullets) {
      b.pos.x += b.vel.x * dt;
      b.pos.y += b.vel.y * dt;
      b.life -= dt;
    }

    this.handlePlayerShots();
    this.handleEnemyShotsVsPlayer();
    this.handleContact();

    for (const p of this.particles) {
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.life -= dt;
    }

    // Cleanup.
    this.bullets = this.bullets.filter((b) => b.life > 0);
    this.enemyBullets = this.enemyBullets.filter((b) => b.life > 0);
    this.enemies = this.enemies.filter(
      (e) => e.hp > 0 && !(e.kind === "blackhole" && e.life <= 0)
    );
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  // ---- Player ----

  private updatePlayer(state: InputState, dt: number): void {
    const p = this.player;
    const move = state.move;

    // Move from left stick.
    p.pos.x += move.x * cfg.PLAYER_SPEED * dt;
    p.pos.y += move.y * cfg.PLAYER_SPEED * dt;
    p.pos.x = clamp(p.pos.x, cfg.WORLD_MARGIN, this.width - cfg.WORLD_MARGIN);
    p.pos.y = clamp(p.pos.y, cfg.WORLD_MARGIN, this.height - cfg.WORLD_MARGIN);

    // Smoothly settle stick velocity toward its target (critically damped → weight
    // without jitter: accelerates and coasts, never snaps).
    const desiredX = move.x * cfg.PLAYER_SPEED;
    const desiredY = move.y * cfg.PLAYER_SPEED;
    const k = 1 - Math.exp(-cfg.PLAYER_RESPONSE * dt);
    p.vel.x += (desiredX - p.vel.x) * k;
    p.vel.y += (desiredY - p.vel.y) * k;

    // Gravity velocity from black holes: accumulates while pulled, damps when free.
    p.grav.x *= Math.max(0, 1 - cfg.PLAYER_GRAV_DAMP * dt);
    p.grav.y *= Math.max(0, 1 - cfg.PLAYER_GRAV_DAMP * dt);

    // Integrate position, capping combined speed so gravity can't make us zoom.
    const cx = p.vel.x + p.grav.x;
    const cy = p.vel.y + p.grav.y;
    const csp = Math.hypot(cx, cy);
    if (csp > cfg.PLAYER_MAX_SPEED) {
      const kc = cfg.PLAYER_MAX_SPEED / csp;
      p.vel.x *= kc; p.vel.y *= kc;
      p.grav.x *= kc; p.grav.y *= kc;
    }
    p.pos.x += (p.vel.x + p.grav.x) * dt;
    p.pos.y += (p.vel.y + p.grav.y) * dt;
    p.pos.x = clamp(p.pos.x, cfg.WORLD_MARGIN, this.width - cfg.WORLD_MARGIN);
    p.pos.y = clamp(p.pos.y, cfg.WORLD_MARGIN, this.height - cfg.WORLD_MARGIN);

    // Face the aim direction only. When the right stick idles, hold the last aim
    // orientation rather than snapping to the movement direction.
    if (state.firing && (state.aimDir.x !== 0 || state.aimDir.y !== 0)) {
      p.facing = Math.atan2(state.aimDir.y, state.aimDir.x);
    }

    // Auto-fire while right stick is deflected.
    p.fireCooldown -= dt;
    if (state.firing && p.fireCooldown <= 0) {
      p.fireCooldown = 1 / cfg.FIRE_RATE;
      const d = state.aimDir;
      this.bullets.push({
        pos: v(p.pos.x + d.x * (p.radius + cfg.BULLET_RADIUS), p.pos.y + d.y * (p.radius + cfg.BULLET_RADIUS)),
        vel: v(d.x * cfg.BULLET_SPEED, d.y * cfg.BULLET_SPEED),
        radius: cfg.BULLET_RADIUS,
        life: cfg.BULLET_LIFE,
      });
      // Subtle muzzle flash (kept dim since it's additive-composited).
      const muzzle = v(p.pos.x + d.x * (p.radius + 4), p.pos.y + d.y * (p.radius + 4));
      this.particles.push({
        pos: muzzle,
        vel: v(d.x * 60, d.y * 60),
        life: 0.05,
        maxLife: 0.05,
        size: 1.6,
        color: PALETTE.bullet,
      });
      this.fx.shoot?.();
      this.addShake(cfg.SHAKE_FIRE);
    }
  }

  private addShake(a: number): void {
    this.shake = Math.min(1, this.shake + a);
  }

  private addHitStop(s: number): void {
    this.hitStop = Math.max(this.hitStop, s);
  }

  private respawn(): void {
    const p = this.player;
    p.alive = true;
    p.pos = v(this.width / 2, this.height / 2);
    p.fireCooldown = 0;
    p.facing = 0;
    p.invuln = cfg.SPAWN_INVULN;
    p.vel = v(0, 0);
    p.grav = v(0, 0);
  }

  private die(): void {
    const p = this.player;
    p.alive = false;
    p.respawnTimer = cfg.RESPAWN_TIME;
    this.streak = 0;
    this.multiplier = 1;
    this.fx.death?.();
    this.addShake(cfg.SHAKE_DEATH);
    this.addHitStop(cfg.HITSTOP_DEATH);
    // Clear enemies around the death point so respawn isn't instant death.
    const r2 = cfg.DEATH_CLEAR_RADIUS ** 2;
    this.enemies = this.enemies.filter((e) => {
      if (dist2(e.pos, p.pos) < r2) {
        this.burst(e.pos, enemyColor(e.kind), 6);
        return false;
      }
      return true;
    });
  }

  // ---- Spawning / waves ----

  private waveScale(): number {
    return Math.min(1 + (this.wave - 1) * cfg.WAVE_SCALE_STEP, cfg.WAVE_SCALE_MAX);
  }

  private enemyCap(): number {
    return Math.min(cfg.ENEMY_CAP_BASE + this.wave, 22);
  }

  private spawnInterval(): number {
    return Math.max(
      cfg.SPAWN_INTERVAL_BASE - (this.wave - 1) * cfg.SPAWN_INTERVAL_STEP,
      cfg.SPAWN_INTERVAL_MIN
    );
  }

  private spawn(dt: number): void {
    if (this.enemies.length >= this.enemyCap()) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = this.spawnInterval();
    this.spawnEnemy(this.pickKind());
  }

  private pickKind(): EnemyKind {
    const w = this.wave;
    if (w < 4) return "chaser";
    if (w < 7) return Math.random() < 0.7 ? "chaser" : "shooter";
    if (w < 9) {
      const r = Math.random();
      if (r < 0.45) return "chaser";
      if (r < 0.75) return "shooter";
      return "splitter";
    }
    const r = Math.random();
    if (r < 0.4) return "chaser";
    if (r < 0.65) return "shooter";
    if (r < 0.85) return "splitter";
    return "blackhole";
  }

  private spawnEnemy(kind: EnemyKind): void {
    const pos = this.edgePoint();
    const e: Enemy = { kind: "chaser", pos, vel: v(0, 0), radius: 10, hp: 1, spin: Math.random() * 6.28, fireCooldown: 0, life: 0 };
    switch (kind) {
      case "chaser":
        e.kind = "chaser"; e.radius = cfg.CHASER_RADIUS; break;
      case "minion":
        e.kind = "minion"; e.radius = cfg.MINION_RADIUS; break;
      case "shooter":
        e.kind = "shooter"; e.radius = cfg.SHOOTER_RADIUS; e.fireCooldown = 1.2; e.life = 2 + Math.random() * 2; break;
      case "splitter":
        e.kind = "splitter"; e.radius = cfg.SPLITTER_RADIUS; break;
      case "blackhole":
        e.kind = "blackhole"; e.radius = cfg.BLACKHOLE_RADIUS; e.hp = Infinity; e.life = cfg.BLACKHOLE_LIFE;
        e.vel = v((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
        const l = Math.hypot(e.vel.x, e.vel.y) || 1;
        e.vel = v((e.vel.x / l) * cfg.BLACKHOLE_DRIFT, (e.vel.y / l) * cfg.BLACKHOLE_DRIFT);
        break;
    }
    this.enemies.push(e);
    if (kind === "blackhole") this.fx.blackholeSpawn?.();
  }

  private edgePoint(): Vec {
    if (!this.player.alive) {
      const s = Math.floor(Math.random() * 4);
      if (s === 0) return v(Math.random() * this.width, cfg.WORLD_MARGIN);
      if (s === 1) return v(Math.random() * this.width, this.height - cfg.WORLD_MARGIN);
      if (s === 2) return v(cfg.WORLD_MARGIN, Math.random() * this.height);
      return v(this.width - cfg.WORLD_MARGIN, Math.random() * this.height);
    }
    for (let tries = 0; tries < 8; tries++) {
      const side = Math.floor(Math.random() * 4);
      let pos: Vec;
      if (side === 0) pos = v(Math.random() * this.width, cfg.WORLD_MARGIN);
      else if (side === 1) pos = v(Math.random() * this.width, this.height - cfg.WORLD_MARGIN);
      else if (side === 2) pos = v(cfg.WORLD_MARGIN, Math.random() * this.height);
      else pos = v(this.width - cfg.WORLD_MARGIN, Math.random() * this.height);
      if (Math.hypot(pos.x - this.player.pos.x, pos.y - this.player.pos.y) > cfg.SPAWN_MIN_DIST) return pos;
    }
    return v(Math.random() * this.width, cfg.WORLD_MARGIN);
  }

  // ---- Enemy behavior ----

  private updateEnemies(dt: number, scale: number): void {
    const p = this.player.pos;
    for (const e of this.enemies) {
      e.spin += dt * 3;
      switch (e.kind) {
        case "chaser":
          this.seek(e, cfg.CHASER_SPEED * scale, cfg.CHASER_ACCEL, dt);
          break;
        case "minion":
          this.seek(e, cfg.MINION_SPEED * scale, cfg.MINION_ACCEL, dt);
          break;
        case "splitter":
          this.seek(e, cfg.SPLITTER_SPEED * scale, cfg.CHASER_ACCEL * 0.8, dt);
          break;
        case "shooter":
          this.shooterBehavior(e, p, dt, scale);
          break;
        case "blackhole":
          e.life -= dt;
          e.pos.x += e.vel.x * dt;
          e.pos.y += e.vel.y * dt;
          this.bounce(e);
          break;
      }

      if (e.kind !== "blackhole") {
        e.pos.x += e.vel.x * dt;
        e.pos.y += e.vel.y * dt;
        this.bounce(e);
      }
    }
  }

  private seek(e: Enemy, maxSpeed: number, accel: number, dt: number): void {
    const d = norm(v(this.player.pos.x - e.pos.x, this.player.pos.y - e.pos.y));
    e.vel.x += d.x * accel * dt;
    e.vel.y += d.y * accel * dt;
    const sp = Math.hypot(e.vel.x, e.vel.y);
    if (sp > maxSpeed) {
      e.vel.x = (e.vel.x / sp) * maxSpeed;
      e.vel.y = (e.vel.y / sp) * maxSpeed;
    }
  }

  private shooterBehavior(e: Enemy, p: Vec, dt: number, scale: number): void {
    const toPlayer = v(p.x - e.pos.x, p.y - e.pos.y);
    const dist = Math.hypot(toPlayer.x, toPlayer.y) || 1;
    const toward = norm(toPlayer);
    const range = cfg.SHOOTER_RANGE;
    const maxSpeed = cfg.SHOOTER_SPEED * scale;

    // Strafe direction flips on a timer (e.life doubles as the timer here).
    e.life -= dt;
    if (e.life <= 0) {
      e.life = 2 + Math.random() * 2;
      e.spin += Math.PI; // flips strafe sign via sin
    }
    const strafeSign = Math.sin(e.spin) >= 0 ? 1 : -1;
    const perp = v(-toward.y, toward.x);

    let dir: Vec;
    if (dist > range + cfg.SHOOTER_RANGE_TOLERANCE) dir = toward;
    else if (dist < range - cfg.SHOOTER_RANGE_TOLERANCE) dir = { x: -toward.x, y: -toward.y };
    else dir = { x: perp.x * strafeSign, y: perp.y * strafeSign };

    e.vel.x += dir.x * cfg.SHOOTER_ACCEL * dt;
    e.vel.y += dir.y * cfg.SHOOTER_ACCEL * dt;
    const sp = Math.hypot(e.vel.x, e.vel.y);
    if (sp > maxSpeed) {
      e.vel.x = (e.vel.x / sp) * maxSpeed;
      e.vel.y = (e.vel.y / sp) * maxSpeed;
    }

    // Fire an aimed burst.
    e.fireCooldown -= dt;
    if (e.fireCooldown <= 0 && dist < range * 1.6 && this.player.alive) {
      e.fireCooldown = cfg.SHOOTER_FIRE_INTERVAL / scale;
      this.enemyBullets.push({
        pos: v(e.pos.x + toward.x * (e.radius + cfg.ENEMY_BULLET_RADIUS), e.pos.y + toward.y * (e.radius + cfg.ENEMY_BULLET_RADIUS)),
        vel: v(toward.x * cfg.ENEMY_BULLET_SPEED, toward.y * cfg.ENEMY_BULLET_SPEED),
        radius: cfg.ENEMY_BULLET_RADIUS,
        life: cfg.ENEMY_BULLET_LIFE,
      });
    }
  }

  private bounce(e: Enemy): void {
    const m = cfg.WORLD_MARGIN;
    if (e.pos.x < m) { e.pos.x = m; e.vel.x = Math.abs(e.vel.x); }
    if (e.pos.x > this.width - m) { e.pos.x = this.width - m; e.vel.x = -Math.abs(e.vel.x); }
    if (e.pos.y < m) { e.pos.y = m; e.vel.y = Math.abs(e.vel.y); }
    if (e.pos.y > this.height - m) { e.pos.y = this.height - m; e.vel.y = -Math.abs(e.vel.y); }
  }

  // ---- Black hole gravity ----

  private applyBlackholeGravity(dt: number): void {
    for (const bh of this.enemies) {
      if (bh.kind !== "blackhole") continue;
      for (const e of this.enemies) {
        if (e === bh || e.kind === "blackhole") continue;
        this.pull(e, bh, dt, true);
      }
      if (this.player.alive) this.pullPlayer(bh, dt);
    }
  }

  private pull(e: Enemy, bh: Enemy, dt: number, applyFalloff: boolean): void {
    const d = v(bh.pos.x - e.pos.x, bh.pos.y - e.pos.y);
    const dist = Math.hypot(d.x, d.y);
    if (dist < 1 || dist > cfg.BLACKHOLE_PULL_RADIUS) return;
    const falloff = applyFalloff ? 1 - dist / cfg.BLACKHOLE_PULL_RADIUS : 1;
    const dir = norm(d);
    const a = cfg.BLACKHOLE_PULL_STRENGTH * falloff;
    e.vel.x += dir.x * a * dt;
    e.vel.y += dir.y * a * dt;
  }

  private pullPlayer(bh: Enemy, dt: number): void {
    const p = this.player;
    if (!p.alive) return;
    const dx = bh.pos.x - p.pos.x;
    const dy = bh.pos.y - p.pos.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist > cfg.BLACKHOLE_PULL_RADIUS) return;
    const falloff = 1 - dist / cfg.BLACKHOLE_PULL_RADIUS;
    const a = cfg.BLACKHOLE_PULL_STRENGTH * falloff;
    // Accumulate gravity velocity so pull genuinely accelerates you inward.
    p.grav.x += (dx / dist) * a * dt;
    p.grav.y += (dy / dist) * a * dt;
  }

  // ---- Combat resolution ----

  private handlePlayerShots(): void {
    for (const e of this.enemies) {
      if (e.kind === "blackhole") continue; // immortal hazard
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i];
        if (e.hp <= 0) break;
        if (dist2(b.pos, e.pos) < (b.radius + e.radius) ** 2) {
          this.bullets.splice(i, 1);
          e.hp -= 1;
          if (e.hp <= 0) this.onEnemyDestroyed(e);
        }
      }
    }
  }

  private onEnemyDestroyed(e: Enemy): void {
    const base = cfg.SCORE[e.kind as ScoreKey];
    const splitBonus = e.kind === "splitter" ? 1 + cfg.SPLIT_BONUS : 1;
    const gained = base * this.multiplier * splitBonus;
    this.score += Math.round(gained);

    this.kills += 1;
    this.streak += 1;
    const tiers = Math.min(Math.floor(this.streak / cfg.STREAK_PER_TIER), Math.log2(cfg.MAX_MULTIPLIER));
    this.multiplier = Math.pow(2, Math.floor(tiers));

    this.burst(e.pos, enemyColor(e.kind), cfg.KILL_PARTICLES);

    // Juice: kill feedback + splitter is extra crunchy.
    this.fx.kill?.();
    this.addShake(cfg.SHAKE_KILL);
    this.addHitStop(cfg.HITSTOP_KILL);
    if (e.kind === "splitter") {
      this.spawnMinions(e.pos);
      this.fx.split?.();
      this.addShake(cfg.SHAKE_SPLIT);
      this.addHitStop(cfg.HITSTOP_SPLIT);
    }
  }

  private spawnMinions(at: Vec): void {
    for (let i = 0; i < cfg.SPLITTER_CHILDREN; i++) {
      const a = Math.random() * Math.PI * 2;
      const off = cfg.SPLITTER_RADIUS + 4;
      const vel = v(Math.cos(a) * cfg.MINION_SPEED * 0.5, Math.sin(a) * cfg.MINION_SPEED * 0.5);
      this.enemies.push({
        kind: "minion",
        pos: v(at.x + Math.cos(a) * off, at.y + Math.sin(a) * off),
        vel,
        radius: cfg.MINION_RADIUS,
        hp: 1,
        spin: Math.random() * 6.28,
        fireCooldown: 0,
        life: 0,
      });
    }
  }

  private handleEnemyShotsVsPlayer(): void {
    if (!this.player.alive || this.player.invuln > 0) return;
    const p = this.player;
    for (const b of this.enemyBullets) {
      if (dist2(b.pos, p.pos) < (b.radius + p.radius) ** 2) {
        this.die();
        return;
      }
    }
  }

  private handleContact(): void {
    if (!this.player.alive || this.player.invuln > 0) return;
    const p = this.player;
    for (const e of this.enemies) {
      if (dist2(e.pos, p.pos) < (e.radius + p.radius) ** 2) {
        this.die();
        return;
      }
    }
  }

  // ---- Effects ----

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

function enemyColor(kind: EnemyKind): string {
  switch (kind) {
    case "chaser": return PALETTE.chaser;
    case "shooter": return PALETTE.shooter;
    case "splitter": return PALETTE.splitter;
    case "minion": return PALETTE.minion;
    case "blackhole": return PALETTE.blackhole;
  }
}

function dist2(a: Vec, b: Vec): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}
