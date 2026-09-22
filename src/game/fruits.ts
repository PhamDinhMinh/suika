export type FruitKind =
  | 'cherry' | 'berry' | 'grape' | 'citrus' | 'apple'
  | 'pear' | 'peach' | 'pine' | 'melon' | 'watermelon';

export interface Fruit {
  vi: string;
  jp: string;
  /** Bán kính vật lý (px, theo hệ toạ độ bàn chơi 440x620) */
  r: number;
  /** Màu nền của quả */
  c: string;
  /** Vùng sáng — dùng cho highlight và viền sáng */
  light: string;
  /** Vùng tối — dùng cho mép quả và hoạ tiết */
  dark: string;
  /** Màu quầng sáng toả ra ngoài */
  glow: string;
  kind: FruitKind;
}

/**
 * Hệ số phóng to mọi quả so với bảng dưới. Hũ không đổi kích thước, nên quả
 * càng to thì càng nhanh đầy và càng dễ thua. 1 = đúng bảng.
 */
export const FRUIT_SCALE = 1;

/**
 * 10 tier, bán kính giãn đều theo cấp số nhân (~1.19 lần mỗi bậc). Ảnh nhân
 * vật trong `assets/bubbles/` đánh số 0-9 khớp đúng thứ tự này.
 */
const BASE_FRUITS: Fruit[] = [
  { vi: 'Anh đào',  jp: 'さくらんぼ',   r: 27,  c: '#ec4152', light: '#ff8f96', dark: '#8e1428', glow: '#ff5f74', kind: 'cherry' },
  { vi: 'Dâu tây',  jp: 'いちご',       r: 33,  c: '#f2604f', light: '#ffa48f', dark: '#9c2a2b', glow: '#ff7a63', kind: 'berry' },
  { vi: 'Nho',      jp: 'ぶどう',       r: 39,  c: '#8b5ce0', light: '#c7a6f7', dark: '#402182', glow: '#a374ff', kind: 'grape' },
  { vi: 'Quýt',     jp: 'デコポン',     r: 46,  c: '#f8ab2e', light: '#ffd98a', dark: '#a9620a', glow: '#ffbe4d', kind: 'citrus' },
  { vi: 'Táo',      jp: 'りんご',       r: 55,  c: '#e13c3c', light: '#ff8a7d', dark: '#8a1520', glow: '#ff5f52', kind: 'apple' },
  { vi: 'Lê',       jp: 'なし',         r: 65,  c: '#d9d05a', light: '#f7f3a8', dark: '#85802a', glow: '#ece27a', kind: 'pear' },
  { vi: 'Đào',      jp: 'もも',         r: 78,  c: '#f892b4', light: '#ffd3e0', dark: '#ad5077', glow: '#ffa8c6', kind: 'peach' },
  { vi: 'Dứa',      jp: 'パイナップル', r: 92,  c: '#edc23a', light: '#ffe895', dark: '#9c7a10', glow: '#ffd85e', kind: 'pine' },
  { vi: 'Dưa lưới', jp: 'メロン',       r: 110, c: '#a3d757', light: '#dcf5a4', dark: '#5b8c26', glow: '#bfe870', kind: 'melon' },
  { vi: 'Dưa hấu',  jp: 'スイカ',       r: 131, c: '#34a253', light: '#7fdd93', dark: '#135429', glow: '#4fc76d', kind: 'watermelon' },
];

/** Bảng quả thật sự dùng trong game — bán kính đã nhân FRUIT_SCALE. */
export const FRUITS: Fruit[] = BASE_FRUITS.map((f) => ({
  ...f,
  r: Math.round(f.r * FRUIT_SCALE),
}));

export const POINTS = [1, 3, 6, 10, 15, 21, 28, 36, 45, 55];

/**
 * Trọng số bốc quả cho ô "quả kế tiếp" — chỉ 4 tier nhỏ nhất, và tier càng to
 * càng hiếm. Bốc đều nhau thì lên tier quá nhanh, hũ không bao giờ đầy.
 */
export const SPAWN_WEIGHTS = [34, 28, 22, 11, 5];

/** Bốc ngẫu nhiên một tier theo SPAWN_WEIGHTS. */
export function randomSpawnTier(): number {
  const total = SPAWN_WEIGHTS.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let t = 0; t < SPAWN_WEIGHTS.length; t++) {
    roll -= SPAWN_WEIGHTS[t];
    if (roll < 0) return t;
  }
  return 0;
}

/** Kích thước hũ theo hệ toạ độ bàn chơi. Bán kính quả (fruits.r) không đổi
 *  giữa các hệ, nên hũ càng thấp thì quả trông càng to trên màn hình. */
export interface WorldSize {
  w: number;
  h: number;
  /** Cao độ của quả đang cầm, tính từ mép trên. */
  dropY: number;
  /** Vạch tràn — quả nằm yên phía trên vạch này quá lâu là thua. */
  deathY: number;
}

/** Điện thoại dựng / desktop: hũ cao, nhiều chỗ chồng quả. */
export const PORTRAIT_WORLD: WorldSize = { w: 440, h: 620, dropY: 62, deathY: 126 };

/** Điện thoại xoay ngang: chiều cao màn hình mới là thứ khan hiếm. Hũ gần
 *  vuông — thấp lại để kéo cao hết màn (quả to hơn ~55% so với hũ dọc) và
 *  nới ngang để bù chỗ chứa đã mất. */
export const LANDSCAPE_WORLD: WorldSize = { w: 520, h: 545, dropY: 58, deathY: 118 };

export const WALL = 13;
export const COOLDOWN = 380;
export const OVERFLOW_LIMIT = 1600;
