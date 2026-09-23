/**
 * Âm thanh game: nhạc nền + hiệu ứng thả / gộp / thua.
 *
 * Thả file vào `src/assets/audio/` đặt đúng tên là dùng file đó —
 * `bgm`, `drop`, `merge`, `gameover` (`.mp3` / `.ogg` / `.wav` / `.m4a`).
 * Thiếu file nào thì phần đó tự tổng hợp bằng Web Audio, y như `art.ts`
 * quay về hoạ tiết vẽ tay khi thiếu ảnh. Nhờ vậy game không kéo theo
 * asset bắt buộc nào — quan trọng với Zalo Mini App (giới hạn dung lượng).
 *
 * iOS/webview chặn phát tiếng trước cử chỉ người dùng, nên AudioContext chỉ
 * được dựng trong `unlock()` (gọi từ lần chạm đầu tiên).
 */

type Slot = 'bgm' | 'drop' | 'merge' | 'gameover';

const files = import.meta.glob<string>('../assets/audio/*.{mp3,ogg,wav,m4a}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const urls = new Map<Slot, string>();
for (const [path, url] of Object.entries(files)) {
  const m = /\/([a-z]+)\.[a-z0-9]+$/i.exec(path);
  if (m) urls.set(m[1].toLowerCase() as Slot, url);
}

const MUTE_KEY = 'suika-muted';
const MUSIC_VOL = 0.22;
const SFX_VOL = 0.5;

/* ---------- nhạc nền tổng hợp ---------- */

const BPM = 92;
/** Một bước = một nốt móc đơn. */
const STEP = 60 / BPM / 2;
const A4 = 440;
const A2 = 110;

/** Giai điệu 4 ô nhịp, ngũ cung La thứ — nghe ra chất hội chợ (yatai). */
// prettier-ignore
const LEAD: (number | null)[] = [
   0,  3,  7,  3,   5,  3,  0, null,
  -2,  0,  3,  0,   7,  5,  3, null,
   0,  3,  7, 10,   7,  5,  3,  0,
  -2, -5, -2,  0,   3,  0, -2, null,
];
/** Nốt gốc của bass cho từng ô nhịp (La - Fa - Đô - Sol). */
const BASS = [0, -4, 3, -2];
const LOOP_STEPS = LEAD.length;

/** Nửa cung -> tần số. */
function hz(base: number, semitones: number) {
  return base * Math.pow(2, semitones / 12);
}

class SuikaAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;

  private buffers = new Map<Slot, AudioBuffer>();
  private bgmNode: AudioBufferSourceNode | null = null;

  /** Bộ định thời cho nhạc tổng hợp. */
  private timer = 0;
  private step = 0;
  private nextNoteAt = 0;

  private muted = loadMuted();
  /** Người chơi đang muốn nghe nhạc — nhạc thật sự chạy khi đã unlock. */
  private wantMusic = false;

  constructor() {
    // Singleton sống hết vòng đời trang nên không cần gỡ listener.
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibility);
    }
  }

  /* ---------- vòng đời ---------- */

  /** Gọi từ cử chỉ đầu tiên của người chơi. An toàn khi gọi lại nhiều lần. */
  unlock() {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor();
      } catch {
        return; // webview không cho dựng — game vẫn chơi được, chỉ là im
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);

      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = MUSIC_VOL;
      const soften = this.ctx.createBiquadFilter();
      soften.type = 'lowpass';
      soften.frequency.value = 2600;
      this.musicBus.connect(soften).connect(this.master);

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = SFX_VOL;
      this.sfxBus.connect(this.master);

      void this.preload();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.wantMusic && !this.muted) this.runMusic();
  }

  private async preload() {
    const ctx = this.ctx;
    if (!ctx) return;
    await Promise.all(
      [...urls].map(async ([slot, url]) => {
        try {
          const res = await fetch(url);
          this.buffers.set(slot, await ctx.decodeAudioData(await res.arrayBuffer()));
        } catch {
          /* hỏng file thì dùng âm tổng hợp */
        }
      }),
    );
    // File bgm về muộn hơn lần unlock: đổi từ nhạc tổng hợp sang file.
    if (this.wantMusic && !this.muted && this.buffers.has('bgm') && !this.bgmNode) {
      this.stopMusicNodes();
      this.runMusic();
    }
  }

  /* ---------- tắt / bật tiếng ---------- */

  isMuted() {
    return this.muted;
  }

  setMuted(next: boolean) {
    this.muted = next;
    saveMuted(next);
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(next ? 0 : 1, this.ctx.currentTime, 0.02);
    }
    if (next) this.stopMusicNodes();
    else if (this.wantMusic) this.unlock();
  }

  /* ---------- nhạc nền ---------- */

  startMusic() {
    this.wantMusic = true;
    if (this.ctx && !this.muted) this.runMusic();
  }

  stopMusic() {
    this.wantMusic = false;
    this.stopMusicNodes();
  }

  private runMusic() {
    if (!this.ctx || this.bgmNode || this.timer) return;
    const buf = this.buffers.get('bgm');
    if (buf) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(this.musicBus!);
      src.start();
      this.bgmNode = src;
      return;
    }
    this.step = 0;
    this.nextNoteAt = this.ctx.currentTime + 0.08;
    this.timer = window.setInterval(this.schedule, 25);
  }

  private stopMusicNodes() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = 0;
    }
    if (this.bgmNode) {
      try {
        this.bgmNode.stop();
      } catch {
        /* đã dừng */
      }
      this.bgmNode = null;
    }
  }

  /** Lên lịch trước ~120ms để không bị giật khi tab bận. */
  private schedule = () => {
    const ctx = this.ctx;
    if (!ctx) return;
    while (this.nextNoteAt < ctx.currentTime + 0.12) {
      const i = this.step % LOOP_STEPS;
      const note = LEAD[i];
      if (note !== null) this.pluck(this.nextNoteAt, hz(A4, note), STEP * 1.6);
      if (i % 8 === 0) this.bassNote(this.nextNoteAt, hz(A2, BASS[(i / 8) | 0]));
      this.nextNoteAt += STEP;
      this.step++;
    }
  };

  private pluck(at: number, freq: number, dur: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.5, at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g).connect(this.musicBus!);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  private bassNote(at: number, freq: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    const dur = STEP * 7;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.75, at + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g).connect(this.musicBus!);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  /* ---------- hiệu ứng ---------- */

  /** Tiếng thả quả — "pop" ngắn, cao độ hơi lệch mỗi lần cho đỡ nhàm. */
  drop() {
    if (this.sample('drop')) return;
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const at = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const f0 = 520 + Math.random() * 90;
    osc.frequency.setValueAtTime(f0, at);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.45, at + 0.13);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.9, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
    osc.connect(g).connect(this.sfxBus!);
    osc.start(at);
    osc.stop(at + 0.18);
  }

  /**
   * Tiếng gộp quả — tier càng to thì càng trầm và ngân lâu, để người chơi
   * nghe ra mình vừa ghép được quả lớn mà không cần nhìn.
   */
  merge(tier: number) {
    if (this.sample('merge', 1 - tier * 0.045)) return;
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const at = ctx.currentTime;
    const root = hz(880, -tier * 2);
    const dur = 0.22 + tier * 0.035;
    for (const [mul, vol] of [
      [1, 0.8],
      [1.5, 0.35],
      [2, 0.18],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = mul === 1 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(root * mul, at);
      osc.frequency.linearRampToValueAtTime(root * mul * 1.06, at + dur * 0.5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(vol, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(g).connect(this.sfxBus!);
      osc.start(at);
      osc.stop(at + dur + 0.02);
    }
  }

  /** Tiếng thua — ba nốt đi xuống. */
  gameOver() {
    this.stopMusicNodes();
    this.wantMusic = false;
    if (this.sample('gameover')) return;
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const at = ctx.currentTime;
    [0, -3, -8].forEach((semi, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = hz(440, semi);
      const g = ctx.createGain();
      const t = at + i * 0.16;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.7, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(g).connect(this.sfxBus!);
      osc.start(t);
      osc.stop(t + 0.52);
    });
  }

  /** Phát file cho slot nếu có; trả về true khi đã phát. */
  private sample(slot: Slot, rate = 1): boolean {
    const buf = this.buffers.get(slot);
    if (!buf || !this.ctx || this.muted) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.max(0.5, rate);
    src.connect(this.sfxBus!);
    src.start();
    return true;
  }

  private onVisibility = () => {
    if (!this.ctx) return;
    if (document.hidden) void this.ctx.suspend();
    else if (!this.muted) void this.ctx.resume();
  };
}

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveMuted(v: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, v ? '1' : '0');
  } catch {
    /* private mode */
  }
}

export const audio = new SuikaAudio();
