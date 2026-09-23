import { useEffect, useRef, type CSSProperties } from 'react';
import { onArtLoaded } from '../game/art';
import { drawFruit } from '../game/draw';
import { FRUITS } from '../game/fruits';
import styles from './MergeLadder.module.css';

/** Bán kính vẽ của tier nhỏ nhất và lớn nhất trong lộ trình. */
const R_MIN = 6;
const R_MAX = 15;
/** Khoảng hở giữa hai bậc liền nhau — đủ chỗ cho mũi tên nối. */
const GAP = 7;
/** Biên độ lượn trái–phải cho bậc thang đỡ cứng. */
const SWAY = 8;
const PAD = 8;

const ladderRadius = (tier: number) => R_MIN + (R_MAX - R_MIN) * (tier / (FRUITS.length - 1));

const sway = (tier: number) => Math.sin(tier * 1.05) * SWAY;

/**
 * Vị trí từng bậc dọc theo *trục chính* của lộ trình, đo từ đầu quả to nhất.
 * Trục chính là chiều dọc khi lộ trình dựng đứng, chiều ngang khi nằm ngang —
 * `pos()` bên dưới lo việc quy đổi.
 */
function layout() {
  const at: number[] = [];
  let d = PAD + ladderRadius(FRUITS.length - 1);
  for (let t = FRUITS.length - 1; t >= 0; t--) {
    at[t] = d;
    if (t > 0) d += (ladderRadius(t) + ladderRadius(t - 1)) * 0.95 + GAP;
  }
  return { at, length: Math.ceil(d + ladderRadius(0) + PAD) };
}

const { at: STEP_AT, length: LADDER_LEN } = layout();
/** Bề dày của dải — chiều còn lại, đủ chỗ cho quả to nhất và biên độ lượn. */
const LADDER_THICK = Math.ceil((R_MAX + SWAY + PAD) * 2);

interface Props {
  discovered: Set<number>;
  /** Cho phép trang ngoài gán grid-area khi xoay ngang. */
  className?: string;
}

export default function MergeLadder({ discovered, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const paint = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      const w = LADDER_THICK;
      const h = LADDER_LEN;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      /** Tâm của bậc `t` — quả to nhất ở trên cùng. */
      const pos = (t: number) => ({ x: LADDER_THICK / 2 + sway(t), y: STEP_AT[t] });

      const top = Math.max(...[...discovered], -1);

      // Mũi tên nối giữa các bậc, sáng dần theo tiến độ đã mở.
      for (let t = 0; t < FRUITS.length - 1; t++) {
        const reached = discovered.has(t);
        // Cắt hai đầu đoạn nối đúng mép hai quả, theo hướng thật của đoạn.
        const from = pos(t);
        const to = pos(t + 1);
        const a = Math.atan2(to.y - from.y, to.x - from.x);
        const x0 = from.x + Math.cos(a) * (ladderRadius(t) + 2);
        const y0 = from.y + Math.sin(a) * (ladderRadius(t) + 2);
        const x1 = to.x - Math.cos(a) * (ladderRadius(t + 1) + 2);
        const y1 = to.y - Math.sin(a) * (ladderRadius(t + 1) + 2);
        ctx.strokeStyle = reached ? 'rgba(255,178,63,0.55)' : 'rgba(142,144,192,0.22)';
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();

        // Bậc kế tiếp chưa mở: chỉ mũi tên để thấy đang tiến tới đâu.
        if (t === top) {
          ctx.fillStyle = 'rgba(255,178,63,0.9)';
          ctx.save();
          ctx.translate(x1, y1);
          ctx.rotate(a);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-5.5, -3.4);
          ctx.lineTo(-5.5, 3.4);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }

      for (let t = 0; t < FRUITS.length; t++) {
        const r = ladderRadius(t);
        const { x, y } = pos(t);
        const seen = discovered.has(t);

        if (t === top) {
          ctx.strokeStyle = 'rgba(255,178,63,0.75)';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(x, y, r + 3.5, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.globalAlpha = seen ? 1 : 0.32;
        drawFruit(ctx, t, x, y, 0, r / FRUITS[t].r);
        ctx.globalAlpha = 1;
      }
    };

    paint();
    return onArtLoaded(paint);
  }, [discovered]);

  return (
    <div className={className ? `${styles.wrap} ${className}` : styles.wrap}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={
          {
            '--lw': `${LADDER_THICK}px`,
            '--lh': `${LADDER_LEN}px`,
            '--lar': `${LADDER_THICK} / ${LADDER_LEN}`,
          } as CSSProperties
        }
        role="img"
        aria-label={`Lộ trình hợp thành: ${FRUITS.map((f) => f.vi).join(' → ')}. Đã mở ${discovered.size} trên ${FRUITS.length}.`}
      />
      <p className={styles.label}>
        Lộ trình
        <br />
        hợp thành
      </p>
    </div>
  );
}
