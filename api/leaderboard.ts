import { createHash } from 'node:crypto';

/**
 * Bảng xếp hạng toàn server — Vercel Function, lưu ở Upstash Redis.
 *
 * Toàn bộ bảng là MỘT sorted set: member = id thiết bị, score = điểm cao nhất.
 * `ZADD GT` chỉ ghi đè khi điểm mới lớn hơn điểm đang có (thiết bị mới thì
 * thêm vào), nên "cao hơn mới cập nhật" do Redis lo, không có race giữa đọc
 * và ghi.
 *
 * Tên người chơi nằm riêng trong một hash (id -> tên), ghi đè mỗi lần gửi.
 *
 *   GET  /api/leaderboard?deviceId=…&limit=20 -> top N + hạng của thiết bị này
 *   POST /api/leaderboard { deviceId, score?, name? } -> nộp điểm và/hoặc đổi tên
 *
 * Biến môi trường: KV_REST_API_URL + KV_REST_API_TOKEN (Vercel tự gắn khi nối
 * Upstash qua Marketplace), hoặc UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.
 */

const KEY = 'suika:leaderboard';
const NAMES_KEY = 'suika:names';
const MAX_NAME = 20;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
/** Trần điểm hợp lệ — chặn số rác chứ không phải chống gian lận. */
const MAX_SCORE = 10_000_000;
const DEVICE_ID_RE = /^[\w:.+/=-]{8,160}$/;

const CORS: Record<string, string> = {
  // Zalo Mini App chạy trên domain của Zalo nên luôn là cross-origin.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

interface Entry {
  rank: number;
  /** Mã rút gọn từ hash, để phân biệt người chơi mà không lộ id thiết bị thật. */
  tag: string;
  /** null với người chơi chưa đặt tên. */
  name: string | null;
  score: number;
  me: boolean;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function tagOf(deviceId: string) {
  return createHash('sha256').update(deviceId).digest('hex').slice(0, 6).toUpperCase();
}

/**
 * Gọn khoảng trắng, bỏ ký tự điều khiển / vô hình, cắt theo ký tự chứ không
 * theo code unit để không chẻ đôi emoji. Rỗng thì coi như không có tên.
 */
function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = [...raw.normalize('NFC').replace(/\s+/g, ' ').replace(/\p{C}/gu, '').trim()]
    .slice(0, MAX_NAME)
    .join('')
    .trim();
  return name || null;
}

type Cmd = (string | number)[];

/**
 * Redis giả trong bộ nhớ, do dev server của Vite gắn vào (api/_memory.ts).
 * Trên Vercel không bao giờ có, nên thiếu cấu hình ở đó vẫn báo lỗi thật.
 */
function devMemory() {
  return (globalThis as { __suikaMemoryRedis?: (cmds: Cmd[]) => unknown[] }).__suikaMemoryRedis;
}

/** Gửi nhiều lệnh Redis trong một request qua REST pipeline của Upstash. */
async function redis(cmds: Cmd[]): Promise<unknown[]> {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    const memory = devMemory();
    if (memory) return memory(cmds);
    throw new Error('Thiếu cấu hình Redis');
  }

  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!res.ok) throw new Error(`Redis ${res.status}`);
  const out = (await res.json()) as { result?: unknown; error?: string }[];
  return out.map((r) => {
    if (r.error) throw new Error(r.error);
    return r.result;
  });
}

/** Đọc top N và vị trí của thiết bị đang hỏi, gộp chung một lượt pipeline. */
async function board(deviceId: string | null, limit: number, pre: Cmd[] = []) {
  const cmds: Cmd[] = [...pre, ['ZRANGE', KEY, 0, limit - 1, 'REV', 'WITHSCORES'], ['ZCARD', KEY]];
  if (deviceId) {
    cmds.push(
      ['ZREVRANK', KEY, deviceId],
      ['ZSCORE', KEY, deviceId],
      ['HGET', NAMES_KEY, deviceId],
    );
  }

  const res = (await redis(cmds)).slice(pre.length);
  const flat = res[0] as string[];
  const ids: string[] = [];
  const scores: number[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    ids.push(flat[i]);
    scores.push(Number(flat[i + 1]));
  }
  // Lượt thứ hai: tên của top N — phải biết id là ai rồi mới hỏi được.
  const names = ids.length
    ? ((await redis([['HMGET', NAMES_KEY, ...ids]]))[0] as (string | null)[])
    : [];

  const top: Entry[] = ids.map((id, i) => ({
    rank: i + 1,
    tag: tagOf(id),
    name: names[i] ?? null,
    score: scores[i],
    me: id === deviceId,
  }));

  const rank = res[2];
  const me: Entry | null =
    deviceId && rank !== null && rank !== undefined
      ? {
          rank: Number(rank) + 1,
          tag: tagOf(deviceId),
          name: (res[4] as string | null) ?? null,
          score: Number(res[3]),
          me: true,
        }
      : null;

  return { top, total: Number(res[1]), me };
}

function parseLimit(raw: string | null) {
  const n = Number(raw ?? DEFAULT_LIMIT);
  return Number.isInteger(n) ? Math.min(Math.max(n, 1), MAX_LIMIT) : DEFAULT_LIMIT;
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const deviceId = params.get('deviceId');
  if (deviceId !== null && !DEVICE_ID_RE.test(deviceId)) {
    return json({ error: 'deviceId không hợp lệ' }, 400);
  }
  try {
    return json(await board(deviceId, parseLimit(params.get('limit'))));
  } catch (e) {
    console.error(e);
    return json({ error: 'Không đọc được bảng xếp hạng' }, 500);
  }
}

export async function POST(req: Request) {
  let body: { deviceId?: unknown; score?: unknown; name?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: 'Body phải là JSON' }, 400);
  }

  const { deviceId, score } = body;
  if (typeof deviceId !== 'string' || !DEVICE_ID_RE.test(deviceId)) {
    return json({ error: 'deviceId không hợp lệ' }, 400);
  }
  // Không có score là chỉ đổi tên — không thêm người chơi 0 điểm vào bảng.
  if (
    score !== undefined &&
    (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > MAX_SCORE)
  ) {
    return json({ error: 'score không hợp lệ' }, 400);
  }
  const name = cleanName(body.name);
  if (score === undefined && !name) return json({ error: 'Thiếu score hoặc name' }, 400);

  const writes: Cmd[] = [];
  if (name) writes.push(['HSET', NAMES_KEY, deviceId, name]);
  if (score !== undefined) writes.push(['ZADD', KEY, 'GT', score, deviceId]);

  const limit = parseLimit(new URL(req.url).searchParams.get('limit'));
  try {
    return json(await board(deviceId, limit, writes));
  } catch (e) {
    console.error(e);
    return json({ error: 'Không lưu được điểm' }, 500);
  }
}
