/**
 * Redis giả trong bộ nhớ, CHỈ dùng khi chạy `npm run dev` mà chưa khai báo
 * Upstash (xem devApi trong vite.config.ts). Khởi động lại dev server là mất
 * sạch dữ liệu.
 *
 * Chỉ cài đúng những lệnh leaderboard.ts dùng. Tiền tố `_` để Vercel không coi
 * file này là một Function.
 */

const zsets = new Map<string, Map<string, number>>();
const hashes = new Map<string, Map<string, string>>();

function zset(key: string) {
  let z = zsets.get(key);
  if (!z) zsets.set(key, (z = new Map<string, number>()));
  return z;
}

function hash(key: string) {
  let h = hashes.get(key);
  if (!h) hashes.set(key, (h = new Map<string, string>()));
  return h;
}

/** Điểm giảm dần; bằng điểm thì member lớn hơn đứng trước, giống ZREVRANGE. */
function desc(key: string) {
  return [...zset(key)].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1));
}

function exec(cmd: (string | number)[]): unknown {
  const [op, key, ...args] = cmd.map(String);
  switch (op) {
    case 'ZADD': {
      // Chỉ hỗ trợ dạng ZADD key GT score member.
      const z = zset(key);
      const score = Number(args[1]);
      const member = args[2];
      const cur = z.get(member);
      if (cur === undefined || score > cur) z.set(member, score);
      return cur === undefined ? 1 : 0;
    }
    case 'ZRANGE':
      return desc(key)
        .slice(Number(args[0]), Number(args[1]) + 1)
        .flatMap(([m, s]) => [m, String(s)]);
    case 'ZCARD':
      return zset(key).size;
    case 'ZREVRANK': {
      const i = desc(key).findIndex(([m]) => m === args[0]);
      return i < 0 ? null : i;
    }
    case 'ZSCORE': {
      const s = zset(key).get(args[0]);
      return s === undefined ? null : String(s);
    }
    case 'HSET':
      hash(key).set(args[0], args[1]);
      return 1;
    case 'HGET':
      return hash(key).get(args[0]) ?? null;
    case 'HMGET':
      return args.map((f) => hash(key).get(f) ?? null);
    default:
      throw new Error(`memory redis: chưa hỗ trợ ${op}`);
  }
}

export function memoryPipeline(cmds: (string | number)[][]): unknown[] {
  return cmds.map(exec);
}
