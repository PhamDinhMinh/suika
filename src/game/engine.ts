import {
  Bodies,
  Body,
  Composite,
  Engine,
  Events,
  type IEventCollision,
  type Engine as MatterEngine,
} from 'matter-js';
import { drawFruit } from './draw';
import {
  COOLDOWN,
  FRUITS,
  OVERFLOW_LIMIT,
  POINTS,
  PORTRAIT_WORLD,
  randomSpawnTier,
  WALL,
  type WorldSize,
} from './fruits';

type FruitBody = Body & {
  tier: number;
  bornAt: number;
  popAt: number;
  merged: boolean;
  dropped?: boolean;
};

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export interface SuikaHandlers {
  onScore?(score: number): void;
  onBest?(best: number): void;
  onNext?(tier: number): void;
  onDiscover?(tier: number): void;
  onGameOver?(score: number, biggestTier: number): void;
}

const BEST_KEY = 'suika-best';

function loadBest(): number {
  try {
    return parseInt(localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(v: number) {
  try {
    localStorage.setItem(BEST_KEY, String(v));
  } catch {
    /* private mode */
  }
}

/**
 * Toàn bộ vòng đời game: vật lý (Matter.js), input, render canvas.
 * Không phụ thuộc React — dùng lại được trong Zalo Mini App / Vite / vanilla.
 */
export class SuikaGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private board: HTMLElement;
  private handlers: SuikaHandlers;
  private reduceMotion: boolean;
  /** Kích thước hũ hiện tại — đổi được lúc đang chơi khi máy xoay màn hình. */
  private world: WorldSize;
  private walls: Body[] = [];

  private engine!: MatterEngine;
  private raf = 0;
  private prev = 0;
  private destroyed = false;

  private score = 0;
  private best = 0;
  private nextTier = 0;
  private aimX: number;
  private lastDrop = -Infinity;
  private overflowFor = 0;
  private running = false;
  private dead = false;

  private mergeQueue: Array<[FruitBody, FruitBody]> = [];
  private particles: Particle[] = [];
  private discovered = new Set<number>();

  constructor(
    canvas: HTMLCanvasElement,
    board: HTMLElement,
    handlers: SuikaHandlers = {},
    world: WorldSize = PORTRAIT_WORLD,
  ) {
    this.canvas = canvas;
    this.board = board;
    this.handlers = handlers;
    this.world = world;
    this.aimX = world.w / 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context không khả dụng');
    this.ctx = ctx;
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ---------- lifecycle ---------- */

  start() {
    this.best = loadBest();
    this.handlers.onBest?.(this.best);
    this.bindInput();
    this.reset();
    this.prev = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  reset() {
    this.dead = false;
    this.overflowFor = 0;
    this.score = 0;
    this.particles = [];
    this.mergeQueue.length = 0;
    this.handlers.onScore?.(0);
    if (this.engine) {
      Events.off(this.engine, 'collisionStart', this.onCollide);
      Engine.clear(this.engine);
    }
    this.buildWorld();
    this.pickNext();
    this.lastDrop = -Infinity;
    this.running = true;
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.unbindInput();
    if (this.engine) {
      Events.off(this.engine, 'collisionStart', this.onCollide);
      Engine.clear(this.engine);
    }
  }

  /* ---------- world ---------- */

  private buildWorld() {
    this.engine = Engine.create();
    this.engine.gravity.y = 1.1;
    this.engine.positionIterations = 8;
    this.engine.velocityIterations = 7;
    this.walls = this.makeWalls();
    Composite.add(this.engine.world, this.walls);
    Events.on(this.engine, 'collisionStart', this.onCollide);
  }

  private makeWalls(): Body[] {
    const { w, h } = this.world;
    const opts = { isStatic: true, friction: 0.4, restitution: 0.05 };
    return [
      Bodies.rectangle(w / 2, h - WALL / 2, w, WALL, opts),
      Bodies.rectangle(WALL / 2, h / 2, WALL, h, opts),
      Bodies.rectangle(w - WALL / 2, h / 2, WALL, h, opts),
    ];
  }

  /**
   * Đổi kích thước hũ mà không huỷ ván đang chơi (máy xoay ngang/dọc).
   * Đống quả được dời theo đáy hũ, kèm 1.2s ân hạn để không thua oan vì
   * trần hũ vừa hạ xuống.
   */
  setWorld(next: WorldSize) {
    const prev = this.world;
    if (prev.w === next.w && prev.h === next.h) return;
    this.world = next;
    if (!this.engine) return;

    const dy = next.h - prev.h;
    const now = performance.now();
    for (const b of this.fruits()) {
      const r = FRUITS[b.tier].r;
      Body.setPosition(b, {
        x: Math.min(next.w - WALL - r, Math.max(WALL + r, b.position.x)),
        y: b.position.y + dy,
      });
      b.bornAt = now;
    }

    Composite.remove(this.engine.world, this.walls);
    this.walls = this.makeWalls();
    Composite.add(this.engine.world, this.walls);
    this.aimX = (this.aimX / prev.w) * next.w;
    this.overflowFor = 0;
  }

  private fruitBody(tier: number, x: number, y: number): FruitBody {
    const f = FRUITS[tier];
    const b = Bodies.circle(x, y, f.r, {
      restitution: 0.12,
      friction: 0.32,
      frictionStatic: 0.6,
      density: 0.0012,
      slop: 0.02,
    }) as FruitBody;
    b.tier = tier;
    b.bornAt = performance.now();
    b.popAt = performance.now();
    b.merged = false;
    this.markDiscovered(tier);
    return b;
  }

  private fruits(): FruitBody[] {
    return Composite.allBodies(this.engine.world).filter(
      (b): b is FruitBody => (b as FruitBody).tier !== undefined,
    );
  }

  private markDiscovered(tier: number) {
    if (this.discovered.has(tier)) return;
    this.discovered.add(tier);
    this.handlers.onDiscover?.(tier);
  }

  private onCollide = (ev: IEventCollision<MatterEngine>) => {
    for (const pair of ev.pairs) {
      const a = pair.bodyA as FruitBody;
      const b = pair.bodyB as FruitBody;
      if (a.tier === undefined || b.tier === undefined) continue;
      if (a.tier !== b.tier || a.merged || b.merged) continue;
      a.merged = b.merged = true;
      this.mergeQueue.push([a, b]);
    }
  };

  private resolveMerges() {
    while (this.mergeQueue.length) {
      const [a, b] = this.mergeQueue.shift()!;
      const tier = a.tier;
      const x = (a.position.x + b.position.x) / 2;
      const y = (a.position.y + b.position.y) / 2;
      Composite.remove(this.engine.world, a);
      Composite.remove(this.engine.world, b);
      this.addScore(POINTS[tier]);
      this.burst(x, y, FRUITS[tier].light);
      if (tier >= FRUITS.length - 1) continue;
      const grown = this.fruitBody(tier + 1, x, y);
      Composite.add(this.engine.world, grown);
      Body.setVelocity(grown, { x: 0, y: -1.2 });
    }
  }

  private addScore(n: number) {
    this.score += n;
    this.handlers.onScore?.(this.score);
    if (this.score > this.best) {
      this.best = this.score;
      this.handlers.onBest?.(this.best);
      saveBest(this.best);
    }
  }

  private burst(x: number, y: number, color: string) {
    if (this.reduceMotion) return;
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1.5 + Math.random() * 3;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 1, color });
    }
  }

  /* ---------- input ---------- */

  private clampAim(x: number, tier: number) {
    const r = FRUITS[tier].r;
    return Math.max(WALL + r + 1, Math.min(this.world.w - WALL - r - 1, x));
  }

  private toLocalX(clientX: number) {
    const rect = this.canvas.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * this.world.w;
  }

  private onPointerDown = (e: PointerEvent) => {
    this.board.setPointerCapture(e.pointerId);
    this.aimX = this.toLocalX(e.clientX);
  };
  private onPointerMove = (e: PointerEvent) => {
    this.aimX = this.toLocalX(e.clientX);
  };
  private onPointerUp = (e: PointerEvent) => {
    this.aimX = this.toLocalX(e.clientX);
    this.drop();
  };
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      this.aimX -= 16;
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      this.aimX += 16;
      e.preventDefault();
    } else if (e.key === ' ' || e.key === 'Enter') {
      this.drop();
      e.preventDefault();
    }
  };

  private bindInput() {
    this.board.addEventListener('pointerdown', this.onPointerDown);
    this.board.addEventListener('pointermove', this.onPointerMove);
    this.board.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
  }

  private unbindInput() {
    this.board.removeEventListener('pointerdown', this.onPointerDown);
    this.board.removeEventListener('pointermove', this.onPointerMove);
    this.board.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
  }

  private drop() {
    if (!this.running || this.dead) return;
    const now = performance.now();
    if (now - this.lastDrop < COOLDOWN) return;
    this.lastDrop = now;
    const b = this.fruitBody(
      this.nextTier,
      this.clampAim(this.aimX, this.nextTier),
      this.world.dropY,
    );
    b.dropped = true;
    Composite.add(this.engine.world, b);
    this.pickNext();
  }

  private pickNext() {
    this.nextTier = randomSpawnTier();
    this.handlers.onNext?.(this.nextTier);
  }

  /* ---------- game over ---------- */

  private checkOverflow(dt: number) {
    const now = performance.now();
    let over = false;
    for (const b of this.fruits()) {
      if (now - b.bornAt < 1200) continue;
      if (b.speed > 0.6) continue;
      if (b.position.y - FRUITS[b.tier].r < this.world.deathY) {
        over = true;
        break;
      }
    }
    this.overflowFor = over ? this.overflowFor + dt : 0;
    if (this.overflowFor > OVERFLOW_LIMIT) this.gameOver();
  }

  private gameOver() {
    this.dead = true;
    this.running = false;
    const biggest = this.fruits().reduce((m, b) => Math.max(m, b.tier), 0);
    this.handlers.onGameOver?.(this.score, biggest);
  }

  /* ---------- render ---------- */

  private render() {
    const { ctx } = this;
    const { w: W, h: H, dropY: DROP_Y, deathY: DEATH_Y } = this.world;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.canvas.width !== W * dpr || this.canvas.height !== H * dpr) {
      this.canvas.width = W * dpr;
      this.canvas.height = H * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // thành hũ
    ctx.fillStyle = '#0b0d24';
    ctx.fillRect(0, 0, WALL, H);
    ctx.fillRect(W - WALL, 0, WALL, H);
    ctx.fillRect(0, H - WALL, W, WALL);
    ctx.fillStyle = '#ffb23f22';
    ctx.fillRect(WALL - 2, 0, 2, H);
    ctx.fillRect(W - WALL, 0, 2, H);
    ctx.fillRect(WALL, H - WALL, W - WALL * 2, 2);

    // vạch nguy hiểm
    const danger = Math.min(1, this.overflowFor / OVERFLOW_LIMIT);
    ctx.save();
    ctx.setLineDash([9, 9]);
    ctx.lineWidth = 2;
    ctx.strokeStyle =
      danger > 0 ? `rgba(224,69,60,${0.4 + danger * 0.6})` : 'rgba(142,144,192,0.35)';
    ctx.beginPath();
    ctx.moveTo(WALL, DEATH_Y);
    ctx.lineTo(W - WALL, DEATH_Y);
    ctx.stroke();
    ctx.restore();

    // đường ngắm + quả đang cầm
    if (this.running && !this.dead) {
      const x = this.clampAim(this.aimX, this.nextTier);
      ctx.save();
      ctx.setLineDash([4, 10]);
      ctx.strokeStyle = 'rgba(255,178,63,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, DROP_Y + FRUITS[this.nextTier].r);
      ctx.lineTo(x, H - WALL);
      ctx.stroke();
      ctx.restore();
      const ready = Math.min(1, (performance.now() - this.lastDrop) / COOLDOWN);
      ctx.globalAlpha = 0.45 + ready * 0.55;
      drawFruit(ctx, this.nextTier, x, DROP_Y, 0, 1);
      ctx.globalAlpha = 1;
    }

    const now = performance.now();
    for (const b of this.fruits()) {
      const pop = Math.min(1, (now - b.popAt) / 170);
      const scale = this.reduceMotion ? 1 : 1 + 0.18 * Math.sin(pop * Math.PI) * (1 - pop * 0.2);
      drawFruit(ctx, b.tier, b.position.x, b.position.y, b.angle, scale);
    }

    if (this.particles.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (const p of this.particles) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3 * p.life + 1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- loop ---------- */

  private frame = (t: number) => {
    if (this.destroyed) return;
    const dt = Math.min(40, t - this.prev);
    this.prev = t;
    if (this.running) {
      Engine.update(this.engine, 1000 / 60);
      this.resolveMerges();
      this.checkOverflow(dt);
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.25;
      p.life -= 0.035;
    }
    this.render();
    this.raf = requestAnimationFrame(this.frame);
  };
}
