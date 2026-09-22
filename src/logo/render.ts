/**
 * Trang dựng logo: vẽ lại đúng bóng của game bằng `drawFruit` nên logo và
 * trong game không bao giờ lệch nhau. Chạy `yarn dev` rồi mở
 * http://localhost:5173/logo.html?mode=icon (icon | favicon | wordmark),
 * chụp lại canvas ra PNG — xem brand/README.md.
 */
import { onArtLoaded } from '../game/art';
import { drawFruit, setSpriteResolution } from '../game/draw';
import { FRUITS } from '../game/fruits';

interface Bubble {
  /** Tier trong FRUITS — quyết định ảnh nhân vật và màu quầng sáng. */
  tier: number;
  /** Toạ độ và bán kính trên lưới 512, không phụ thuộc cỡ canvas thật. */
  x: number;
  y: number;
  r: number;
}

interface Layout {
  /** Cạnh canvas thật. Trần nét thật sự là ảnh nhân vật 320px, nên bóng to
   *  nhất nên dưới ~400px; quá ngưỡng đó là mặt nhân vật bắt đầu nhoè. */
  size: number;
  bubbles: Bubble[];
  /** Bo góc (đơn vị lưới 512). Icon app để 0: store tự bo. */
  rounded: number;
  /** Nền trong suốt để trang bên ngoài tự lo phần nền. */
  transparent?: boolean;
}

/** Đống quả lệch một bên, giống lúc quả chồng thật trong hũ. */
const PILE: Bubble[] = [
  { tier: 2, x: 118, y: 228, r: 50 },
  { tier: 0, x: 365, y: 218, r: 40 },
  { tier: 3, x: 254, y: 170, r: 28 },
  { tier: 9, x: 250, y: 298, r: 100 },
];

const LAYOUTS: Record<string, Layout> = {
  icon: { size: 1024, bubbles: PILE, rounded: 0 },
  // Favicon 16-180px: một quả to là hết chỗ, thêm quả nhỏ cho đỡ trống góc.
  favicon: {
    size: 512,
    rounded: 96,
    bubbles: [
      { tier: 3, x: 395, y: 95, r: 62 },
      { tier: 9, x: 240, y: 280, r: 180 },
    ],
  },
  wordmark: { size: 512, bubbles: PILE, rounded: 0, transparent: true },
};

function backdrop(ctx: CanvasRenderingContext2D) {
  const night = ctx.createLinearGradient(0, 0, 0, 512);
  night.addColorStop(0, '#1b1f4d');
  night.addColorStop(1, '#090b1e');
  ctx.fillStyle = night;
  ctx.fillRect(0, 0, 512, 512);

  // Quầng đèn lồng như nền trang game.
  const lantern = ctx.createRadialGradient(256, 61, 0, 256, 61, 358);
  lantern.addColorStop(0, 'rgba(255,178,63,0.26)');
  lantern.addColorStop(1, 'rgba(255,178,63,0)');
  ctx.fillStyle = lantern;
  ctx.fillRect(0, 0, 512, 512);
}

function paint(canvas: HTMLCanvasElement, layout: Layout) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const k = layout.size / 512;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, layout.size, layout.size);
  ctx.save();
  ctx.scale(k, k);
  if (layout.rounded) {
    ctx.beginPath();
    ctx.roundRect(0, 0, 512, 512, layout.rounded);
    ctx.clip();
  }
  if (!layout.transparent) backdrop(ctx);
  for (const b of layout.bubbles) {
    drawFruit(ctx, b.tier, b.x, b.y, 0, b.r / FRUITS[b.tier].r);
  }
  ctx.restore();
}

// Game để sprite 240px cho nhẹ webview; logo cần to hơn nhiều.
setSpriteResolution(220);

const mode = new URLSearchParams(location.search).get('mode') ?? 'icon';
const layout = LAYOUTS[mode] ?? LAYOUTS.icon;
const canvas = document.querySelector('canvas');

if (canvas) {
  canvas.width = layout.size;
  canvas.height = layout.size;
  canvas.style.width = `${layout.size}px`;
  canvas.style.height = `${layout.size}px`;

  const draw = () => {
    paint(canvas, layout);
  };
  draw();
  // Ảnh nhân vật nạp không đồng bộ — vẽ lại khi có ảnh.
  onArtLoaded(draw);

  const far = Math.max(...layout.bubbles.map((b) => Math.hypot(b.x - 256, b.y - 256) + b.r));
  const big = Math.max(...layout.bubbles.map((b) => (b.r * 2 * layout.size) / 512));
  document.title =
    `logo ${mode} — mép xa tâm nhất ${far.toFixed(0)}/205px, ` +
    `bóng to nhất ${big.toFixed(0)}px (ảnh gốc 320px)`;
}
