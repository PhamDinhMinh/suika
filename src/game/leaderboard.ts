import { getDeviceIdAsync } from 'zmp-sdk/apis';

/**
 * Client của bảng xếp hạng (server: `api/leaderboard.ts`).
 *
 * Người chơi được định danh bằng id thiết bị: trong Zalo lấy từ zmp-sdk, chạy
 * trên web thường thì tự sinh một UUID và giữ trong localStorage. Tên do người
 * chơi tự nhập, giữ ở máy và gửi kèm mỗi lần nộp điểm để server luôn có bản mới.
 */

export interface LeaderboardEntry {
  rank: number;
  tag: string;
  name: string | null;
  score: number;
  me: boolean;
}

export interface Leaderboard {
  top: LeaderboardEntry[];
  total: number;
  me: LeaderboardEntry | null;
}

/**
 * Bản web deploy trên Vercel gọi cùng origin nên để trống là được. Bản Zalo Mini
 * App chạy trên domain của Zalo, phải trỏ tuyệt đối: VITE_API_BASE=https://….vercel.app
 */
const API = `${(import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')}/api/leaderboard`;
const LOCAL_ID_KEY = 'suika-device-id';
const NAME_KEY = 'suika-name';
/** Khớp MAX_NAME ở server. */
export const MAX_NAME = 20;
/** Ngoài Zalo, zmp-sdk có thể treo mãi không trả lời — đừng chờ nó. */
const ZALO_TIMEOUT = 1500;

function randomId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Webview Android cũ chưa có randomUUID.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

function localId() {
  try {
    let id = localStorage.getItem(LOCAL_ID_KEY);
    if (!id) {
      id = `web-${randomId()}`;
      localStorage.setItem(LOCAL_ID_KEY, id);
    }
    return id;
  } catch {
    // Không có storage thì id chỉ sống trong phiên này.
    return `web-${randomId()}`;
  }
}

async function zaloId(): Promise<string | null> {
  try {
    const id = await Promise.race([
      getDeviceIdAsync(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), ZALO_TIMEOUT)),
    ]);
    return id ? `zalo-${id}` : null;
  } catch {
    return null;
  }
}

let deviceIdPromise: Promise<string> | null = null;

export function getDeviceId(): Promise<string> {
  deviceIdPromise ??= zaloId().then((id) => id ?? localId());
  return deviceIdPromise;
}

export function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function storeName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* private mode */
  }
}

async function request(init?: RequestInit, query = ''): Promise<Leaderboard> {
  const deviceId = await getDeviceId();
  const url = `${API}?deviceId=${encodeURIComponent(deviceId)}${query}`;
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`Leaderboard ${res.status}`);
  return (await res.json()) as Leaderboard;
}

export function fetchLeaderboard(limit = 20): Promise<Leaderboard> {
  return request(undefined, `&limit=${limit}`);
}

async function post(body: { score?: number; name?: string }, limit: number) {
  const deviceId = await getDeviceId();
  return request(
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, ...body }),
    },
    `&limit=${limit}`,
  );
}

/** Nộp điểm một ván. Server chỉ ghi khi điểm này cao hơn điểm đã lưu. */
export function submitScore(score: number, limit = 20): Promise<Leaderboard> {
  return post({ score, name: loadName() || undefined }, limit);
}

/**
 * Lưu tên ở máy ngay (để lần sau khỏi hỏi lại dù mạng lỗi), rồi đẩy lên server.
 * Lỗi mạng thì thôi — lần nộp điểm kế tiếp sẽ mang tên theo.
 */
export function savePlayerName(name: string, limit = 20): Promise<Leaderboard> {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  storeName(clean);
  return post({ name: clean }, limit);
}
