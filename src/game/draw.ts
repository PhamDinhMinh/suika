import { getArt, loadArt } from './art';
import { FRUITS, type Fruit } from './fruits';

const TAU = Math.PI * 2;

/** Bán kính sprite / bán kính quả — chừa chỗ cho quầng sáng toả ra ngoài. */
const HALO = 1.42;

/** Chuyển '#rrggbb' + alpha -> 'rgba(...)'. */
function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/* ------------------------------------------------------------------ *
 * Hoạ tiết bên trong quả — lớp duy nhất xoay theo vật lý.
 * ------------------------------------------------------------------ */

function paintDetail(c: CanvasRenderingContext2D, f: Fruit, r: number) {
  c.lineCap = 'round';
  switch (f.kind) {
    case 'watermelon': {
      c.strokeStyle = rgba(f.dark, 0.9);
      c.lineWidth = r * 0.16;
      for (let i = -2; i <= 2; i++) {
        c.beginPath();
        c.moveTo(i * r * 0.42, -r);
        c.quadraticCurveTo(i * r * 0.62, 0, i * r * 0.42, r);
        c.stroke();
      }
      break;
    }
    case 'melon': {
      c.strokeStyle = rgba(f.light, 0.85);
      c.lineWidth = r * 0.05;
      for (let i = -2; i <= 2; i++) {
        c.beginPath();
        c.moveTo(-r, i * r * 0.4);
        c.quadraticCurveTo(0, i * r * 0.4 + r * 0.18, r, i * r * 0.4);
        c.stroke();
        c.beginPath();
        c.moveTo(i * r * 0.4, -r);
        c.quadraticCurveTo(i * r * 0.4 + r * 0.18, 0, i * r * 0.4, r);
        c.stroke();
      }
      break;
    }
    case 'pine': {
      c.strokeStyle = rgba(f.dark, 0.38);
      c.lineWidth = r * 0.055;
      for (let i = -3; i <= 3; i++) {
        c.beginPath();
        c.moveTo(-r, i * r * 0.36 - r);
        c.lineTo(r, i * r * 0.36 + r);
        c.stroke();
        c.beginPath();
        c.moveTo(-r, i * r * 0.36 + r);
        c.lineTo(r, i * r * 0.36 - r);
        c.stroke();
      }
      break;
    }
    case 'berry': {
      c.fillStyle = '#ffe9a8';
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4,
          rad = r * (0.25 + (i % 3) * 0.22);
        c.beginPath();
        c.ellipse(Math.cos(a) * rad, Math.sin(a) * rad, r * 0.07, r * 0.05, a, 0, TAU);
        c.fill();
      }
      break;
    }
    case 'pear': {
      c.fillStyle = rgba(f.dark, 0.32);
      for (let i = 0; i < 12; i++) {
        const a = i * 1.9,
          rad = r * (0.2 + (i % 4) * 0.2);
        c.beginPath();
        c.arc(Math.cos(a) * rad, Math.sin(a) * rad, r * 0.035, 0, TAU);
        c.fill();
      }
      break;
    }
    case 'grape': {
      c.fillStyle = rgba(f.light, 0.22);
      for (let i = 0; i < 5; i++) {
        const a = i * 1.25;
        c.beginPath();
        c.arc(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, r * 0.3, 0, TAU);
        c.fill();
      }
      break;
    }
    case 'citrus': {
      c.strokeStyle = rgba(f.light, 0.5);
      c.lineWidth = r * 0.06;
      c.beginPath();
      c.arc(0, r * 0.15, r * 0.7, Math.PI * 0.15, Math.PI * 0.85);
      c.stroke();
      break;
    }
    case 'peach': {
      c.strokeStyle = rgba(f.dark, 0.75);
      c.lineWidth = r * 0.07;
      c.beginPath();
      c.moveTo(0, -r);
      c.quadraticCurveTo(r * 0.18, 0, 0, r);
      c.stroke();
      break;
    }
    case 'apple':
    case 'cherry': {
      c.strokeStyle = '#6b4a22';
      c.lineWidth = Math.max(1.5, r * 0.09);
      c.beginPath();
      c.moveTo(0, -r * 0.7);
      c.quadraticCurveTo(r * 0.2, -r * 1.05, r * 0.42, -r * 0.95);
      c.stroke();
      c.fillStyle = '#56b978';
      c.beginPath();
      c.ellipse(r * 0.34, -r * 0.72, r * 0.26, r * 0.13, -0.5, 0, TAU);
      c.fill();
      break;
    }
  }
}

/* ------------------------------------------------------------------ *
 * Hai lớp sprite.
 *
 * `body`  — xoay theo vật lý: quầng sáng (đối xứng tâm nên xoay không
 *           đổi hình) + nền màu + hoạ tiết.
 * `glass` — KHÔNG xoay: toàn bộ hiệu ứng ánh sáng. Giữ nguồn sáng cố
 *           định ở trên-trái trong lúc quả lăn chính là thứ tạo cảm
 *           giác thuỷ tinh.
 * ------------------------------------------------------------------ */

function paintBody(
  c: CanvasRenderingContext2D,
  f: Fruit,
  R: number,
  art: HTMLImageElement | undefined,
) {
  const halo = c.createRadialGradient(0, 0, R * 0.7, 0, 0, R * HALO);
  halo.addColorStop(0, rgba(f.glow, 0.62));
  halo.addColorStop(0.35, rgba(f.glow, 0.28));
  halo.addColorStop(0.7, rgba(f.glow, 0.08));
  halo.addColorStop(1, rgba(f.glow, 0));
  c.fillStyle = halo;
  c.beginPath();
  c.arc(0, 0, R * HALO, 0, TAU);
  c.fill();

  c.save();
  c.beginPath();
  c.arc(0, 0, R, 0, TAU);
  c.clip();
  c.fillStyle = f.c;
  c.fillRect(-R, -R, R * 2, R * 2);

  if (art) {
    // Phủ kín hình tròn, giữ tỉ lệ, canh giữa.
    const k = (R * 2) / Math.min(art.width, art.height);
    const w = art.width * k;
    const h = art.height * k;
    c.drawImage(art, -w / 2, -h / 2, w, h);

    // Vignette theo màu tier — ảnh nào cũng vẫn phân biệt được tier.
    const vig = c.createRadialGradient(0, 0, R * 0.58, 0, 0, R);
    vig.addColorStop(0, rgba(f.dark, 0));
    vig.addColorStop(0.78, rgba(f.dark, 0.12));
    vig.addColorStop(1, rgba(f.dark, 0.4));
    c.fillStyle = vig;
    c.fillRect(-R, -R, R * 2, R * 2);
  } else {
    paintDetail(c, f, R);
  }
  c.restore();
}

function paintGlass(c: CanvasRenderingContext2D, f: Fruit, R: number, hasArt: boolean) {
  // Có ảnh thì giảm độ đậm của lớp đổ bóng để nhân vật còn đọc được.
  const k = hasArt ? 0.4 : 1;
  c.save();
  c.beginPath();
  c.arc(0, 0, R, 0, TAU);
  c.clip();

  // Khối cầu: sáng ở trên-trái, trong suốt ở dải giữa (để lộ hoạ tiết),
  // tối dần về mép.
  const sphere = c.createRadialGradient(
    -R * 0.36,
    -R * 0.44,
    R * 0.04,
    -R * 0.1,
    -R * 0.12,
    R * 1.32,
  );
  sphere.addColorStop(0, rgba(f.light, 0.88 * k));
  sphere.addColorStop(0.28, rgba(f.light, 0.2 * k));
  sphere.addColorStop(0.55, rgba(f.c, 0));
  sphere.addColorStop(0.86, rgba(f.dark, 0.42 * k));
  sphere.addColorStop(1, rgba(f.dark, 0.82 * k));
  c.fillStyle = sphere;
  c.fillRect(-R, -R, R * 2, R * 2);

  // Ánh hắt từ dưới lên, tránh mặt dưới bị bệt đen.
  const bounce = c.createRadialGradient(R * 0.22, R * 0.6, R * 0.02, R * 0.22, R * 0.6, R * 0.72);
  bounce.addColorStop(0, rgba(f.light, 0.38 * k));
  bounce.addColorStop(1, rgba(f.light, 0));
  c.fillStyle = bounce;
  c.fillRect(-R, -R, R * 2, R * 2);
  c.restore();

  // Rim light dày, toả màu quả, ôm mép dưới-phải.
  const wide = Math.max(2, R * 0.16);
  c.lineCap = 'round';
  c.lineWidth = wide;
  c.strokeStyle = rgba(f.glow, 0.5);
  c.beginPath();
  c.arc(0, 0, R - wide * 0.5, Math.PI * 0.05, Math.PI * 0.7);
  c.stroke();

  // Lõi trắng của rim light.
  const rim = Math.max(1.2, R * 0.07);
  c.lineWidth = rim;
  c.strokeStyle = 'rgba(255,255,255,0.55)';
  c.beginPath();
  c.arc(0, 0, R - rim * 0.8, Math.PI * 0.14, Math.PI * 0.56);
  c.stroke();

  // Viền sáng mảnh chạy hết vòng — gờ của lớp vỏ kính.
  const thin = Math.max(1, R * 0.04);
  c.lineWidth = thin;
  c.strokeStyle = rgba(f.light, 0.75);
  c.beginPath();
  c.arc(0, 0, R - thin / 2, 0, TAU);
  c.stroke();

  // Đốm loé lớn.
  c.save();
  c.translate(-R * 0.38, -R * 0.46);
  c.rotate(-0.6);
  c.scale(1, 0.6);
  const spec = c.createRadialGradient(0, 0, 0, 0, 0, R * 0.29);
  spec.addColorStop(0, 'rgba(255,255,255,0.98)');
  spec.addColorStop(0.42, 'rgba(255,255,255,0.45)');
  spec.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = spec;
  c.beginPath();
  c.arc(0, 0, R * 0.29, 0, TAU);
  c.fill();
  c.restore();

  // Đốm loé nhỏ đối diện.
  c.save();
  c.translate(R * 0.3, -R * 0.54);
  c.rotate(0.5);
  c.scale(1, 0.68);
  c.fillStyle = 'rgba(255,255,255,0.5)';
  c.beginPath();
  c.arc(0, 0, R * 0.1, 0, TAU);
  c.fill();
  c.restore();
}

/* ------------------------------------------------------------------ *
 * Cache sprite. Dựng lười theo từng tier — ván thường không chạm tới
 * mấy quả to nhất nên không phải trả bộ nhớ cho chúng.
 * ------------------------------------------------------------------ */

interface Sprite {
  body: HTMLCanvasElement;
  glass: HTMLCanvasElement;
  /** Bán kính quả trong sprite (lớn hơn bán kính vật lý để có dư nét). */
  R: number;
  /** Có ảnh nhân vật -> giữ quả đứng thẳng thay vì lăn theo vật lý. */
  hasArt: boolean;
}

const cache: Array<Sprite | undefined> = [];

/** Trần bán kính sprite. Trong game 120 là đủ (bóng to nhất ~240px) và giữ cho
 *  sprite của dưa hấu không phình bộ nhớ trên webview. */
let maxSpriteRadius = 120;

/**
 * Nới trần độ phân giải sprite — chỉ dùng cho trang dựng logo, nơi cần bóng
 * vài trăm px. Game không gọi hàm này. Trần thật sự vẫn là kích thước ảnh
 * nhân vật trong `assets/bubbles/` (320px).
 */
export function setSpriteResolution(maxRadius: number) {
  if (maxRadius === maxSpriteRadius) return;
  maxSpriteRadius = maxRadius;
  cache.length = 0;
}

function makeLayer(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const el = document.createElement('canvas');
  el.width = size;
  el.height = size;
  const ctx = el.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context không khả dụng');
  ctx.translate(size / 2, size / 2);
  return [el, ctx];
}

function buildSprite(tier: number): Sprite {
  const f = FRUITS[tier];
  const art = getArt(tier);
  // Vẽ dư độ phân giải để quả nhỏ vẫn nét khi phóng to ở ô "quả kế tiếp",
  // nhưng chặn trần để sprite của dưa hấu không phình bộ nhớ.
  const R = Math.min(maxSpriteRadius, Math.max(48, f.r * 2));
  const size = Math.ceil(R * HALO * 2);

  const [body, bc] = makeLayer(size);
  paintBody(bc, f, R, art);

  const [glass, gc] = makeLayer(size);
  paintGlass(gc, f, R, art !== undefined);

  return { body, glass, R, hasArt: art !== undefined };
}

/** Bán kính vẽ thực tế gồm cả quầng sáng — dùng để canh khung preview. */
export function haloRadius(tier: number, scale = 1): number {
  return FRUITS[tier].r * scale * HALO;
}

export function drawFruit(
  c: CanvasRenderingContext2D,
  tier: number,
  x: number,
  y: number,
  angle = 0,
  scale = 1,
) {
  loadArt((ready) => {
    cache[ready] = undefined;
  });

  const sprite = cache[tier] ?? (cache[tier] = buildSprite(tier));
  const half = (sprite.body.width / 2) * ((FRUITS[tier].r * scale) / sprite.R);
  // Mặt nhân vật quay lộn ngược trông rất kỳ, nên quả có ảnh thì không lăn.
  const spin = sprite.hasArt ? 0 : angle;

  c.save();
  c.translate(x, y);
  c.rotate(spin);
  c.drawImage(sprite.body, -half, -half, half * 2, half * 2);
  c.rotate(-spin);
  c.drawImage(sprite.glass, -half, -half, half * 2, half * 2);
  c.restore();
}
