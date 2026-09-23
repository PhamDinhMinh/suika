import {
  Bodies,
  Body,
  Composite,
  Engine,
  Events,
  type IEventCollision,
  type Engine as MatterEngine,
} from 'matter-js';
import { audio } from './audio';
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
  /** Cao độ ở bước trước — dùng để đo quả có thật sự đang đi xuống không. */
  restY: number;
  /**
   * Vị trí ở bước trước. Matter suy ra vận tốc từ `position - positionPrev`,
   * nên ghi vào đây là cách duy nhất sửa vận tốc **một trục** — `setVelocity`
   * ghi cả hai, mà trục dọc thì không được đụng vào (xem settle()).
   * `@types/matter-js` thiếu khai báo này dù Matter có thật.
   */
  positionPrev: { x: number; y: number };
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

/* --- nhịp game -------------------------------------------------------------
 * Mỗi bước vật lý luôn là 1/60 giây mô phỏng, bất kể màn hình quét bao nhiêu Hz
 * (chạy thẳng theo nhịp vẽ thì máy 120Hz sẽ chơi nhanh gấp đôi máy 60Hz).
 * Muốn game nhanh/chậm thì vặn GAME_SPEED chứ đừng đụng vào STEP_MS: tăng tốc
 * bằng cách chạy nhiều bước hơn trong một giây thật, nên quãng đường mỗi bước
 * không đổi — va chạm vẫn chính xác y hệt, không lo quả xuyên qua nhau.
 * -------------------------------------------------------------------------- */
const STEP_MS = 1000 / 60;
/**
 * 1 giây thật = bao nhiêu giây mô phỏng. Đây là núm duy nhất để chỉnh nhịp
 * game; 1 = nguyên bản, 2 = nhanh gấp đôi.
 *
 * Để ở 1 là cố ý: bản gốc không có hằng số này, nó chạy đúng 1 bước mỗi khung
 * hình, nên nhịp game đi theo tần số quét màn hình — máy 120Hz chơi nhanh gấp
 * đôi máy 60Hz (rơi hết hũ 0.525s so với 1.050s). Để 1 thì mọi máy đều bằng
 * đúng cái nhịp mà màn 60Hz vẫn cho (đo được 1.083s, lệch 3%).
 */
const GAME_SPEED = 1;
/** Số ms thật mà một bước vật lý tiêu thụ. */
const STEP_REAL_MS = STEP_MS / GAME_SPEED;
/** Trần số bước dồn lại sau một lần khựng, để không "tua nhanh" cả đống. */
const MAX_STEPS = 6;

/* --- quả tự trôi sang bên --------------------------------------------------
 * Hai nguyên nhân tách biệt, cần hai liều thuốc khác nhau (xem settle()):
 *
 * 1. Rơi quá nhanh thì cú chạm đáy lọt sâu vào trong nền (đo được 4.4px với
 *    quả nho). Bộ giải mất cả trăm bước mới đẩy ra hết, và ma sát chống lại
 *    lực đẩy khổng lồ đó làm quả quay tít rồi trượt ngang — quả nho trôi 168px
 *    chỉ vì vậy. Cắt trần tốc độ rơi là hết: 168px -> 3.8px, lún 4.4px -> 0.5px.
 *
 * 2. Matter.js không mô phỏng ma sát lăn: hình tròn chạm đáy là giữ nguyên
 *    vận tốc góc rồi lăn ngang mãi (~22px). Cần tự hãm lấy.
 * -------------------------------------------------------------------------- */
/**
 * Trần tốc độ rơi, px mỗi bước. Có một vách đứng rất gắt: đo được 12 -> trôi
 * 4.3px, 14 -> 10.9px, 16 -> 168px (coi như không cắt). Đừng nâng quá 12;
 * muốn quả rơi nhanh hơn thì vặn GAME_SPEED.
 *
 * Ở GAME_SPEED = 1 thì trần này chỉ chạm tới đoạn cuối của cú rơi dài nhất,
 * nên gần như không ảnh hưởng cảm giác — nó chỉ ở đó để chặn cú chạm lún sâu.
 */
const MAX_FALL = 12;
/** Đi xuống nhanh hơn ngần này là đang rơi hoặc đang lăn khỏi đống — kệ nó. */
const REST_DY = 0.4;
/** Hệ số ma sát lăn mỗi bước, chỉ áp cho quả đã nằm trên mặt đỡ. */
const ROLL_DAMP = 0.88;
/** Dưới ngưỡng trôi ngang + vòng quay này thì ghim hẳn quả lại. */
const REST_VX = 0.06;
const REST_SPIN = 0.02;

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
  private handlers: SuikaHandlers;
  private reduceMotion: boolean;
  /** Kích thước hũ hiện tại — đổi được lúc đang chơi khi máy xoay màn hình. */
  private world: WorldSize;
  private walls: Body[] = [];

  private engine!: MatterEngine;
  private raf = 0;
  private prev = 0;
  private acc = 0;
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
    handlers: SuikaHandlers = {},
    world: WorldSize = PORTRAIT_WORLD,
  ) {
    this.canvas = canvas;
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
    this.acc = 0;
    this.running = true;
    audio.startMusic();
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    audio.stopMusic();
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
      b.restY = b.position.y;
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
      // Nảy ít hơn bản đầu (0.12) cho đống quả mau ổn định. Giữ nguyên
      // frictionAir mặc định — tăng lên là quả rơi ì ra ngay.
      restitution: 0.1,
      friction: 0.35,
      frictionStatic: 0.7,
      density: 0.0012,
      slop: 0.02,
    }) as FruitBody;
    b.tier = tier;
    b.bornAt = performance.now();
    b.popAt = performance.now();
    b.merged = false;
    b.restY = y;
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
      audio.merge(tier);
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

  /** Chống quả tự trôi. Chạy sau mỗi bước vật lý; xem khối chú thích đầu file. */
  private settle() {
    for (const b of this.fruits()) {
      // (1) Trần tốc độ rơi, để cú chạm không lọt sâu vào mặt đỡ.
      if (b.velocity.y > MAX_FALL) b.positionPrev.y = b.position.y - MAX_FALL;

      // (2) Ma sát lăn. Phải đo "đang đi xuống" bằng vị trí thật chứ không đọc
      // velocity.y: quả nằm yên trên đáy vẫn bị Matter cộng dồn velocity.y
      // (nó đỡ quả bằng position solver chứ không xoá vận tốc), có lúc lên tới
      // 17px/bước trong khi quả không hề nhúc nhích.
      const dy = b.position.y - b.restY;
      b.restY = b.position.y;
      if (dy > REST_DY) continue;

      Body.setAngularVelocity(b, b.angularVelocity * ROLL_DAMP);
      // Chỉ đụng vào trục ngang. Ghi đè cả velocity.y là tự bơm ngược cái vận
      // tốc rơi giả nói trên vào quả, và đó đúng là thứ sinh ra bug trôi ngang.
      b.positionPrev.x = b.position.x - b.velocity.x * ROLL_DAMP;
      if (Math.abs(b.velocity.x) < REST_VX && Math.abs(b.angularVelocity) < REST_SPIN) {
        b.positionPrev.x = b.position.x;
        Body.setAngularVelocity(b, 0);
      }
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
    audio.unlock(); // webview chỉ cho phát tiếng từ trong một cử chỉ thật
    this.canvas.setPointerCapture(e.pointerId);
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
    audio.unlock();
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

  /**
   * Gắn thẳng lên canvas chứ không lên khung hũ. Khung hũ còn chứa lớp phủ
   * "thua" với nút chơi lại; bắt pointer ở cấp khung thì `setPointerCapture`
   * kéo luôn cả pointerup về khung, khiến `click` bắn vào khung thay vì vào
   * nút — bấm chơi lại không ăn. Canvas là anh em của lớp phủ nên không dính.
   */
  private bindInput() {
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
  }

  private unbindInput() {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
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
    audio.drop();
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
    audio.gameOver();
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
      // Bước cố định: nhịp vật lý không đổi theo tần số quét màn hình. Một
      // bước "ăn" STEP_REAL_MS thời gian thật nhưng đẩy mô phỏng đi STEP_MS,
      // nên game chạy nhanh gấp GAME_SPEED lần.
      this.acc = Math.min(this.acc + dt, STEP_REAL_MS * MAX_STEPS);
      while (this.acc >= STEP_REAL_MS) {
        Engine.update(this.engine, STEP_MS);
        this.acc -= STEP_REAL_MS;
        this.resolveMerges();
        this.settle();
      }
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
