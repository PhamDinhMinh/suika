import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { audio } from '../game/audio';
import { SuikaGame } from '../game/engine';
import { drawFruit } from '../game/draw';
import { FRUITS, LANDSCAPE_WORLD, PORTRAIT_WORLD, type WorldSize } from '../game/fruits';
import MergeLadder from './MergeLadder';
import styles from './SuikaBoard.module.css';

/** Bán kính quả trong ô preview; 128 / 2 / HALO(1.42) ~ 45 là trần để quầng sáng không bị cắt. */
const PREVIEW_R = 44;

/**
 * Ngưỡng "xoay ngang màn hình thấp": bố cục tràn viền + hũ thấp.
 * PHẢI khớp với @media cuối file SuikaBoard.module.css và MergeLadder.module.css.
 */
const LANDSCAPE_MQ = '(orientation: landscape) and (max-height: 620px)';

/**
 * Ngưỡng "điện thoại dựng": lộ trình nằm ngang, hũ ăn trọn bề ngang.
 * PHẢI khớp với @media tương ứng trong SuikaBoard.module.css.
 */
const PHONE_MQ = '(max-width: 719.98px) and (orientation: portrait)';

/** Hũ ứng với hướng màn hình ngay tại thời điểm gọi. */
function currentWorld() {
  return typeof window !== 'undefined' && window.matchMedia(LANDSCAPE_MQ).matches
    ? LANDSCAPE_WORLD
    : PORTRAIT_WORLD;
}

function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setMatches(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [query]);

  return matches;
}

interface GameOverInfo {
  score: number;
  biggest: number;
}

/**
 * Bề ngang lớn nhất của hũ mà vẫn lọt khung `.boardArea`, giữ đúng tỉ lệ.
 *
 * Làm bằng JS chứ không phải CSS là có lý do: bản CSS thuần (container query
 * `min(100cqw, 100cqh * w / h)`) đo sai chiều cao trên máy thấp — hũ phình ra
 * quá khung 79px rồi bị cắt mất đáy. Khung lấy chiều cao từ hàng grid
 * `minmax(0, 1fr)` nên không phụ thuộc vào hũ, không có vòng lặp đo đạc.
 */
function useFitWidth(ref: React.RefObject<HTMLElement | null>, world: WorldSize, on: boolean) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || !on) {
      setWidth(0);
      return;
    }
    const ro = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect;
      setWidth(Math.floor(Math.min(w, (h * world.w) / world.h)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, on, world.w, world.h]);

  return width;
}

export default function SuikaBoard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const nextCanvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<SuikaGame | null>(null);

  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [nextTier, setNextTier] = useState(0);
  const [discovered, setDiscovered] = useState<Set<number>>(() => new Set());
  const [over, setOver] = useState<GameOverInfo | null>(null);
  const [muted, setMuted] = useState(() => audio.isMuted());

  const landscape = useMedia(LANDSCAPE_MQ);
  const phone = useMedia(PHONE_MQ);
  const world = landscape ? LANDSCAPE_WORLD : PORTRAIT_WORLD;
  const fitWidth = useFitWidth(areaRef, world, phone);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const game = new SuikaGame(
      canvas,
      {
        onScore: setScore,
        onBest: setBest,
        onNext: setNextTier,
        onDiscover: (tier) =>
          setDiscovered((prev) => (prev.has(tier) ? prev : new Set(prev).add(tier))),
        onGameOver: (finalScore, biggest) => setOver({ score: finalScore, biggest }),
      },
      // Game chỉ dựng một lần nên đọc thẳng hướng màn hình lúc này, thay vì
      // phụ thuộc `world` (sẽ khiến effect dựng lại game mỗi lần xoay máy).
      currentWorld(),
    );
    gameRef.current = game;
    game.start();

    return () => {
      game.destroy();
      gameRef.current = null;
    };
  }, []);

  // Xoay máy: đổi hũ ngay giữa ván, không mất điểm.
  useEffect(() => {
    gameRef.current?.setWorld(world);
  }, [world]);

  // Vẽ preview quả kế tiếp mỗi khi tier đổi
  useEffect(() => {
    const canvas = nextCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    drawFruit(ctx, nextTier, 0, 0, 0, PREVIEW_R / FRUITS[nextTier].r);
    ctx.restore();
  }, [nextTier]);

  const toggleSound = useCallback(() => {
    const next = !audio.isMuted();
    audio.setMuted(next);
    if (!next) audio.unlock(); // lần chạm này chính là cử chỉ mở khoá tiếng
    setMuted(next);
  }, []);

  const restart = useCallback(() => {
    setOver(null);
    gameRef.current?.reset();
  }, []);

  const next = FRUITS[nextTier];

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <div className={styles.kanji}>スイカゲーム</div>
        <h1 className={styles.title}>
          Suika <em>Yatai</em>
        </h1>
        <p className={styles.tagline}>
          Thả trái cây, hai quả giống nhau chạm nhau thì gộp. Tràn khỏi vạch là thua.
        </p>
      </header>

      <div className={`${styles.card} ${styles.stats}`}>
        {/* Nút phải nằm ngoài .board: engine gắn listener pointer thẳng lên
            phần tử đó, chạy trước handler của React nên không chặn kịp. */}
        <div className={styles.statsHead}>
          <p className={styles.label}>Điểm</p>
          <button
            type="button"
            className={`${styles.sound} ${muted ? styles.soundOff : ''}`}
            aria-label={muted ? 'Bật tiếng' : 'Tắt tiếng'}
            title={muted ? 'Bật tiếng' : 'Tắt tiếng'}
            onClick={toggleSound}
          >
            <SoundIcon muted={muted} />
          </button>
        </div>
        <div className={styles.score}>{score}</div>
        <div className={styles.best}>Cao nhất {best}</div>
      </div>

      <div className={styles.arena}>
        {/* Điện thoại dựng: bỏ hẳn lộ trình, dồn chỗ cho hũ. */}
        {!phone && <MergeLadder className={styles.ladder} discovered={discovered} />}
        <div className={styles.boardArea} ref={areaRef}>
          <div
            className={styles.board}
            style={
              {
                '--ar': `${world.w} / ${world.h}`,
                ...(fitWidth ? { width: `${fitWidth}px` } : null),
              } as CSSProperties
            }
          >
            <canvas ref={canvasRef} width={world.w} height={world.h} />
            {over && (
              <div className={styles.over}>
                <div className={styles.jp}>ゲームオーバー</div>
                <h2>Tràn mất rồi</h2>
                <div className={styles.final}>{over.score}</div>
                <p>
                  Quả lớn nhất: {FRUITS[over.biggest].vi}（{FRUITS[over.biggest].jp}）
                </p>
                <button className={styles.play} type="button" onClick={restart}>
                  Chơi ván mới
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={`${styles.card} ${styles.nextCard}`}>
        <p className={styles.label}>Quả kế tiếp</p>
        <div className={styles.next}>
          <canvas ref={nextCanvasRef} width={128} height={128} />
          <div className={styles.nextText}>
            <div className={styles.nm}>{next.vi}</div>
            <div className={styles.nextJp}>{next.jp}</div>
          </div>
        </div>
      </div>

      <p className={styles.hint}>
        Rê chuột hoặc kéo tay để ngắm, thả ra là quả rơi. Bàn phím: <kbd>←</kbd> <kbd>→</kbd> để
        chỉnh, <kbd>Space</kbd> để thả.
      </p>
    </div>
  );
}

/** Loa bật / tắt — vẽ tay cho khỏi kéo thêm bộ icon vào bundle. */
function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {muted ? (
        <path
          d="M16 9.5l5 5m0-5l-5 5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
        />
      ) : (
        <path
          d="M15.6 9a4.2 4.2 0 0 1 0 6M18.4 6.6a8 8 0 0 1 0 10.8"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
        />
      )}
    </svg>
  );
}
