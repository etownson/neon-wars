// Renderer: additive-composited neon drawing on a 2D canvas.
// Kept separate from the simulation so rendering can be swapped/optimized later.
import * as cfg from "./config";
import { PALETTE } from "./config";
import type { Vec } from "./vec";
import type { Enemy } from "./types";
import type { Game } from "./game";

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private glowCanvas: HTMLCanvasElement;
  private glowCtx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.glowCanvas = document.createElement("canvas");
    this.glowCtx = this.glowCanvas.getContext("2d")!;
  }

  resize(w: number, h: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.glowCanvas.width = this.canvas.width;
    this.glowCanvas.height = this.canvas.height;
    this.glowCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(game: Game): void {
    const { ctx, canvas } = this;

    // Screen shake offsets the whole view; trauma 0..1 scales max offset.
    const ox = (Math.random() * 2 - 1) * game.shake * cfg.SHAKE_PX;
    const oy = (Math.random() * 2 - 1) * game.shake * cfg.SHAKE_PX;
    const m = cfg.SHAKE_PX + 24; // fill margin so shake never shows edges

    ctx.save();
    ctx.translate(ox, oy);
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(-m, -m, canvas.width + 2 * m, canvas.height + 2 * m);
    this.drawGrid();

    const g = this.glowCtx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.glowCanvas.width, this.glowCanvas.height);
    this.drawGlowable(game, g);

    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(this.glowCanvas, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
  }

  private drawGrid(): void {
    const { ctx, canvas } = this;
    ctx.strokeStyle = PALETTE.gridLine;
    ctx.lineWidth = 1;
    const step = 48;
    ctx.beginPath();
    for (let x = 0; x <= canvas.width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
    }
    for (let y = 0; y <= canvas.height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();
    ctx.fillStyle = PALETTE.grid;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  private drawGlowable(game: Game, g: CanvasRenderingContext2D): void {
    // Player bullets.
    g.fillStyle = PALETTE.bullet;
    for (const b of game.bullets) {
      g.beginPath();
      g.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2);
      g.fill();
    }

    // Enemy bullets.
    g.fillStyle = PALETTE.enemyBullet;
    for (const b of game.enemyBullets) {
      g.beginPath();
      g.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2);
      g.fill();
    }

    // Enemies.
    for (const e of game.enemies) this.drawEnemy(g, e);

    // Particles.
    for (const p of game.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      g.globalAlpha = alpha;
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    // Player (blinks while invulnerable after respawn).
    if (game.player.alive) {
      if (game.player.invuln > 0 && Math.floor(game.time * 14) % 2 === 0) g.globalAlpha = 0.35;
      this.drawPlayer(g, game.player);
      g.globalAlpha = 1;
    }
  }

  private drawEnemy(g: CanvasRenderingContext2D, e: Enemy): void {
    switch (e.kind) {
      case "chaser":
        this.polygon(g, e.pos.x, e.pos.y, e.radius, e.spin, 5, PALETTE.chaser, PALETTE.chaserGlow);
        break;
      case "minion":
        this.polygon(g, e.pos.x, e.pos.y, e.radius, e.spin, 3, PALETTE.minion, PALETTE.chaserGlow);
        break;
      case "splitter":
        this.polygon(g, e.pos.x, e.pos.y, e.radius, e.spin, 6, PALETTE.splitter, PALETTE.splitterGlow);
        break;
      case "shooter":
        this.drawShooter(g, e);
        break;
      case "blackhole":
        this.drawBlackHole(g, e);
        break;
    }
  }

  private polygon(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    spin: number,
    sides: number,
    fill: string,
    glow: string
  ): void {
    g.fillStyle = fill;
    g.strokeStyle = glow;
    g.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = spin + (i * Math.PI * 2) / sides;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
    g.stroke();
  }

  private drawShooter(g: CanvasRenderingContext2D, e: Enemy): void {
    // Orb body + rotating crosshair barrel to telegraph aim.
    g.fillStyle = PALETTE.shooter;
    g.strokeStyle = PALETTE.shooterGlow;
    g.beginPath();
    g.arc(e.pos.x, e.pos.y, e.radius, 0, Math.PI * 2);
    g.fill();
    g.stroke();

    // Turret notch.
    const a = e.spin;
    g.translate(e.pos.x, e.pos.y);
    g.beginPath();
    g.moveTo(Math.cos(a) * (e.radius - 2), Math.sin(a) * (e.radius - 2));
    g.lineTo(Math.cos(a) * (e.radius + 6), Math.sin(a) * (e.radius + 6));
    g.lineTo(Math.cos(a + 0.5) * (e.radius - 2), Math.sin(a + 0.5) * (e.radius - 2));
    g.closePath();
    g.fill();
    g.translate(-e.pos.x, -e.pos.y);
  }

  private drawBlackHole(g: CanvasRenderingContext2D, e: Enemy): void {
    // Dark vortex core + glowing magenta accretion ring (pulsing with life).
    const pulse = 0.5 + 0.5 * Math.sin(e.spin * 2);
    g.fillStyle = PALETTE.blackholeCore;
    g.beginPath();
    g.arc(e.pos.x, e.pos.y, e.radius * (0.6 + pulse * 0.15), 0, Math.PI * 2);
    g.fill();

    g.strokeStyle = PALETTE.blackhole;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(e.pos.x, e.pos.y, e.radius, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 1;

    // Accretion streaks (2 short spokes).
    g.fillStyle = PALETTE.blackhole;
    for (let i = 0; i < 3; i++) {
      const a = e.spin + i * (Math.PI * 2) / 3;
      g.beginPath();
      g.arc(e.pos.x + Math.cos(a) * e.radius * 0.5,
            e.pos.y + Math.sin(a) * e.radius * 0.5,
            3 + pulse * 2, 0, Math.PI * 2);
      g.fill();
    }
  }

  private drawPlayer(
    g: CanvasRenderingContext2D,
    player: { pos: Vec; facing: number }
  ): void {
    const { x, y } = player.pos;
    g.save();
    g.translate(x, y);
    g.rotate(player.facing);
    g.fillStyle = PALETTE.player;
    g.strokeStyle = PALETTE.playerGlow;
    const r = cfg.PLAYER_RADIUS;
    g.beginPath();
    g.moveTo(r * 1.4, 0);
    g.lineTo(-r * 0.8, -r * 0.8);
    g.lineTo(-r * 0.8, r * 0.8);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}
