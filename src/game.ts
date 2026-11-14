// The simulation: fixed-timestep update of all entities, wave-driven spawning,
// archetype behavior (chaser/shooter/splitter/black hole), scoring + multiplier,
// and collision. Pure state + update — no rendering here.
import * as cfg from "./config";
import { PALETTE, ScoreKey } from "./config";
import { norm, v, Vec, clamp } from "./vec";
import type { Bullet, Enemy, EnemyKind, Particle, Player, InputState, Pickup, PickupKind } from "./types";
import type { Fx } from "./audio";
import type { Rng } from "./rng";

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
  spawnTimer = cfg.FIRST_SPAWN_DELAY;

  shake = 0; // screen-shake trauma 0..1
  hitStop = 0; // seconds of simulation freeze
  flash = 0; // white-flash overlay 0..1 (bomb)

  lives = cfg.LIVES_START;
  bombs = cfg.BOMBS_START;
  spreadTimer = 0; // seconds of spread rifle remaining
  gameOver = false;
  paused = false;
  best = 0;

  pickups: Pickup[] = [];

  width: number;
  height: number;
  private fx: Fx;
  private rng: Rng;

  constructor(width: number, height: number, fx: Fx = {}, rng: Rng = Math.random) {
    this.fx = fx;
    this.rng = rng;
    this.width = width;
    this.height = height;
    this.best = this.loadBest();
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

  // ---- Persistence ----

  private loadBest(): number {
    try {
      const n = Number(localStorage.getItem(cfg.HIGH_SCORE_KEY));
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  }

  private updateBest(): void {
    if (this.score <= this.best) return;
    this.best = this.score;
    try {
      localStorage.setItem(cfg.HIGH_SCORE_KEY, String(this.best));
    } catch {
      /* storage unavailable */
    }
  }

  private computeMultiplier(streak: number): number {
    if (streak <= 0) return 1;
    const raw = 1 + Math.floor((cfg.MAX_MULTIPLIER - 1) * Math.pow(streak / cfg.MULT_STREAK_FOR_MAX, cfg.MULT_CURVE_POWER));
    return Math.min(cfg.MAX_MULTIPLIER, raw);
  }

  /** Fresh run: keep the persistent best, reset everything else. */
  reset(): void {
    this.score = 0;
    this.kills = 0;
    this.streak = 0;
    this.multiplier = 1;
    this.wave = 1;
    this.waveTime = 0;
    this.spawnTimer = cfg.FIRST_SPAWN_DELAY;
    this.lives = cfg.LIVES_START;
    this.bombs = cfg.BOMBS_START;
    this.spreadTimer = 0;
    this.gameOver = false;
    this.paused = false;
    this.shake = 0;
    this.hitStop = 0;
    this.flash = 0;
    this.enemies = [];
    this.enemyBullets = [];
    this.bullets = [];
    this.particles = [];
    this.pickups = [];
    const p = this.player;
    p.pos = v(this.width / 2, this.height / 2);
    p.vel = v(0, 0);
    p.grav = v(0, 0);
    p.alive = true;
    p.invuln = cfg.SPAWN_INVULN;
    p.fireCooldown = 0;
  }

  /** Dev helper: jump straight to a wave (clears the board) and revive the player. */
  setWave(n: number): void {
    this.wave = Math.max(1, Math.floor(n));
    this.waveTime = 0;
    this.paused = false;
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

    // Pause / game over: freeze the simulation.
    if (this.paused || this.gameOver) return;

    this.time += dt;
    this.shake = Math.max(0, this.shake - cfg.SHAKE_DECAY * dt);
    this.flash = Math.max(0, this.flash - dt * cfg.FLASH_DECAY);
    this.spreadTimer = Math.max(0, this.spreadTimer - dt);
    this.updateBest();

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
    this.updatePickups(dt);

    for (const p of this.particles) {
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.life -= dt;
    }

    // Cleanup.
    this.pickups = this.pickups.filter((p) => p.life > 0);
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
      const baseAngle = Math.atan2(state.aimDir.y, state.aimDir.x);
      if (this.spreadTimer > 0) {
        // Spread rifle: fire a fan of shots.
        const n = cfg.SPREAD_BULLETS;
        for (let i = 0; i < n; i++) {
          const off = -cfg.SPREAD_ANGLE / 2 + (cfg.SPREAD_ANGLE * i) / (n - 1);
          this.fireBullet(baseAngle + off);
        }
      } else {
        this.fireBullet(baseAngle);
      }
      // Muzzle flash (kept dim since it's additive-composited).
      const d = state.aimDir;
      this.particles.push({
        pos: v(p.pos.x + d.x * (p.radius + cfg.MUZZLE_OFFSET), p.pos.y + d.y * (p.radius + cfg.MUZZLE_OFFSET)),
        vel: v(d.x * cfg.MUZZLE_SPEED, d.y * cfg.MUZZLE_SPEED),
        life: cfg.MUZZLE_LIFE,
        maxLife: cfg.MUZZLE_LIFE,
        size: cfg.MUZZLE_SIZE,
        color: PALETTE.bullet,
      });
      this.fx.shoot?.();
      this.addShake(cfg.SHAKE_FIRE);
    }
  }

  private fireBullet(angle: number): void {
    this.bullets.push({
      pos: v(this.player.pos.x + Math.cos(angle) * (this.player.radius + cfg.BULLET_RADIUS), this.player.pos.y + Math.sin(angle) * (this.player.radius + cfg.BULLET_RADIUS)),
      vel: v(Math.cos(angle) * cfg.BULLET_SPEED, Math.sin(angle) * cfg.BULLET_SPEED),
      radius: cfg.BULLET_RADIUS,
      life: cfg.BULLET_LIFE,
    });
  }

  private addShake(a: number): void {
    this.shake = Math.min(1, this.shake + a);
  }

  private addHitStop(s: number): void {
    this.hitStop = Math.max(this.hitStop, s);
  }

  /**
   * Detonate a carried bomb: clear the board with score, flash and boom.
   * Every enemy cleared scores at the multiplier in effect when the bomb went off;
   * the cleared enemies still count toward the streak, so the multiplier rises afterward.
   */
  detonateBomb(): void {
    if (this.paused || this.gameOver || !this.player.alive || this.bombs <= 0) return;
    this.bombs -= 1;
    this.fx.boom?.();
    this.addShake(cfg.BOMB_SHAKE);
    this.addHitStop(cfg.BOMB_HITSTOP);
    this.flash = cfg.BOMB_FLASH;
    const mult = this.multiplier;
    for (const e of this.enemies) {
      const base = cfg.SCORE[e.kind as ScoreKey];
      this.score += Math.round(base * mult);
      this.kills += 1;
      this.streak += 1;
      this.burst(e.pos, enemyColor(e.kind), cfg.BOMB_PARTICLES);
    }
    this.multiplier = this.computeMultiplier(this.streak);
    this.enemies = [];
    this.enemyBullets = [];
    this.updateBest();
  }

  // ---- Pickups ----

  private spawnPickup(at: Vec): void {
    if (this.gameOver) return;
    if (this.pickups.length >= cfg.PICKUP_MAX_ON_FIELD) return;
    const kind = weightedPick(cfg.PICKUP_WEIGHTS, this.rng) as PickupKind;
    this.pickups.push({ kind, pos: v(at.x, at.y), life: cfg.PICKUP_DESPAWN, spin: this.rng() * 6.28 });
  }

  private updatePickups(dt: number): void {
    const p = this.player;
    for (const pu of this.pickups) {
      pu.life -= dt;
      pu.spin += dt * cfg.PICKUP_SPIN_SPEED;
      if (p.alive && dist2(pu.pos, p.pos) < (cfg.PICKUP_RADIUS + p.radius) ** 2) {
        this.collectPickup(pu);
        pu.life = 0; // removed in cleanup
        continue;
      }
    }
  }

  private collectPickup(pu: Pickup): void {
    switch (pu.kind) {
      case "spread":
        this.spreadTimer = cfg.SPREAD_DURATION;
        this.fx.collect?.();
        break;
      case "bomb":
        if (this.bombs < cfg.BOMBS_MAX) this.bombs += 1;
        this.fx.collect?.();
        break;
      case "life":
        if (this.lives < cfg.LIVES_MAX) this.lives += 1;
        this.fx.extraLife?.();
        break;
    }
    this.burst(pu.pos, PALETTE.bullet, cfg.PICKUP_PARTICLES);
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
    this.streak = 0;
    this.multiplier = 1;
    this.spreadTimer = 0;
    this.fx.death?.();
    this.addShake(cfg.SHAKE_DEATH);
    this.addHitStop(cfg.HITSTOP_DEATH);
    // Clear enemies around the death point so respawn isn't instant death.
    const r2 = cfg.DEATH_CLEAR_RADIUS ** 2;
    this.enemies = this.enemies.filter((e) => {
      if (dist2(e.pos, p.pos) < r2) {
        this.burst(e.pos, enemyColor(e.kind), cfg.DEATH_CLEAR_PARTICLES);
        return false;
      }
      return true;
    });

    this.lives -= 1;
    this.updateBest();
    if (this.lives <= 0) {
      this.gameOver = true; // frozen; HUD/main shows game-over and restart
      return;
    }
    p.respawnTimer = cfg.RESPAWN_TIME;
  }

  // ---- Spawning / waves ----

  private waveScale(): number {
    return Math.min(1 + (this.wave - 1) * cfg.WAVE_SCALE_STEP, cfg.WAVE_SCALE_MAX);
  }

  private enemyCap(): number {
    return Math.min(cfg.ENEMY_CAP_BASE + this.wave, cfg.ENEMY_CAP_MAX);
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
    let mix = cfg.SPAWN_MIX[0];
    for (const m of cfg.SPAWN_MIX) if (m.fromWave <= this.wave) mix = m;
    return weightedPick(mix.weights, this.rng) as EnemyKind;
  }

  private spawnEnemy(kind: EnemyKind): void {
    const pos = this.edgePoint();
    const e: Enemy = { kind: "chaser", pos, vel: v(0, 0), radius: 10, hp: cfg.ENEMY_HP, spin: this.rng() * 6.28, fireCooldown: 0, life: 0 };
    switch (kind) {
      case "chaser":
        e.kind = "chaser"; e.radius = cfg.CHASER_RADIUS; break;
      case "minion":
        e.kind = "minion"; e.radius = cfg.MINION_RADIUS; break;
      case "shooter":
        e.kind = "shooter"; e.radius = cfg.SHOOTER_RADIUS; e.fireCooldown = cfg.SHOOTER_FIRST_SHOT; e.life = this.strafeFlipTime(); break;
      case "splitter":
        e.kind = "splitter"; e.radius = cfg.SPLITTER_RADIUS; break;
      case "blackhole":
        e.kind = "blackhole"; e.radius = cfg.BLACKHOLE_RADIUS; e.hp = Infinity; e.life = cfg.BLACKHOLE_LIFE;
        e.vel = v((this.rng() - 0.5) * 2, (this.rng() - 0.5) * 2);
        const l = Math.hypot(e.vel.x, e.vel.y) || 1;
        e.vel = v((e.vel.x / l) * cfg.BLACKHOLE_DRIFT, (e.vel.y / l) * cfg.BLACKHOLE_DRIFT);
        break;
    }
    this.enemies.push(e);
    if (kind === "blackhole") this.fx.blackholeSpawn?.();
  }

  private edgePoint(): Vec {
    if (!this.player.alive) {
      const s = Math.floor(this.rng() * 4);
      if (s === 0) return v(this.rng() * this.width, cfg.WORLD_MARGIN);
      if (s === 1) return v(this.rng() * this.width, this.height - cfg.WORLD_MARGIN);
      if (s === 2) return v(cfg.WORLD_MARGIN, this.rng() * this.height);
      return v(this.width - cfg.WORLD_MARGIN, this.rng() * this.height);
    }
    for (let tries = 0; tries < 8; tries++) {
      const side = Math.floor(this.rng() * 4);
      let pos: Vec;
      if (side === 0) pos = v(this.rng() * this.width, cfg.WORLD_MARGIN);
      else if (side === 1) pos = v(this.rng() * this.width, this.height - cfg.WORLD_MARGIN);
      else if (side === 2) pos = v(cfg.WORLD_MARGIN, this.rng() * this.height);
      else pos = v(this.width - cfg.WORLD_MARGIN, this.rng() * this.height);
      if (Math.hypot(pos.x - this.player.pos.x, pos.y - this.player.pos.y) > cfg.SPAWN_MIN_DIST) return pos;
    }
    return v(this.rng() * this.width, cfg.WORLD_MARGIN);
  }

  // ---- Enemy behavior ----

  private updateEnemies(dt: number, scale: number): void {
    const p = this.player.pos;
    for (const e of this.enemies) {
      e.spin += dt * cfg.ENEMY_SPIN_SPEED;
      switch (e.kind) {
        case "chaser":
          this.seek(e, cfg.CHASER_SPEED * scale, cfg.CHASER_ACCEL, dt);
          break;
        case "minion":
          this.seek(e, cfg.MINION_SPEED * scale, cfg.MINION_ACCEL, dt);
          break;
        case "splitter":
          this.seek(e, cfg.SPLITTER_SPEED * scale, cfg.SPLITTER_ACCEL, dt);
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
      e.life = this.strafeFlipTime();
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
    if (e.fireCooldown <= 0 && dist < cfg.SHOOTER_FIRE_RANGE && this.player.alive) {
      e.fireCooldown = cfg.SHOOTER_FIRE_INTERVAL / scale;
      this.enemyBullets.push({
        pos: v(e.pos.x + toward.x * (e.radius + cfg.ENEMY_BULLET_RADIUS), e.pos.y + toward.y * (e.radius + cfg.ENEMY_BULLET_RADIUS)),
        vel: v(toward.x * cfg.ENEMY_BULLET_SPEED, toward.y * cfg.ENEMY_BULLET_SPEED),
        radius: cfg.ENEMY_BULLET_RADIUS,
        life: cfg.ENEMY_BULLET_LIFE,
      });
    }
  }

  private strafeFlipTime(): number {
    return cfg.SHOOTER_STRAFE_FLIP_MIN + this.rng() * (cfg.SHOOTER_STRAFE_FLIP_MAX - cfg.SHOOTER_STRAFE_FLIP_MIN);
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
    this.multiplier = this.computeMultiplier(this.streak);

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

    // Chance to drop a pickup.
    if (this.rng() < cfg.PICKUP_SPAWN_CHANCE) this.spawnPickup(e.pos);
  }

  private spawnMinions(at: Vec): void {
    for (let i = 0; i < cfg.SPLITTER_CHILDREN; i++) {
      const a = this.rng() * Math.PI * 2;
      const off = cfg.SPLITTER_RADIUS + cfg.MINION_SPLIT_GAP;
      const vel = v(Math.cos(a) * cfg.MINION_SPLIT_SPEED, Math.sin(a) * cfg.MINION_SPLIT_SPEED);
      this.enemies.push({
        kind: "minion",
        pos: v(at.x + Math.cos(a) * off, at.y + Math.sin(a) * off),
        vel,
        radius: cfg.MINION_RADIUS,
        hp: cfg.ENEMY_HP,
        spin: this.rng() * 6.28,
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
      const a = this.rng() * Math.PI * 2;
      const sp = cfg.PARTICLE_SPEED * lerp(cfg.PARTICLE_SPEED_MIN, cfg.PARTICLE_SPEED_MAX, this.rng());
      this.particles.push({
        pos: v(origin.x, origin.y),
        vel: v(Math.cos(a) * sp, Math.sin(a) * sp),
        life: cfg.PARTICLE_LIFE * lerp(cfg.PARTICLE_LIFE_MIN, cfg.PARTICLE_LIFE_MAX, this.rng()),
        maxLife: cfg.PARTICLE_LIFE,
        size: lerp(cfg.PARTICLE_SIZE_MIN, cfg.PARTICLE_SIZE_MAX, this.rng()),
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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Pick a key with probability proportional to its weight (keys in declaration order). */
function weightedPick(weights: Partial<Record<string, number>>, rng: () => number): string {
  const entries = Object.entries(weights).filter((e): e is [string, number] => (e[1] ?? 0) > 0);
  if (entries.length === 1) return entries[0][0];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = rng() * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r < 0) return k;
  }
  return entries[entries.length - 1][0];
}

function dist2(a: Vec, b: Vec): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}
