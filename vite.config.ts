import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * Ghi app-config.json vào dist với đúng tên file mà lần build này sinh ra.
 * Trước đây tên file có hash được chép tay vào config, nên build lại một cái là
 * config trỏ vào file không tồn tại và Zalo mở ra màn hình trắng.
 */
function zaloAppConfig(): Plugin {
  return {
    name: 'zalo-app-config',
    apply: 'build',
    // writeBundle chứ không phải generateBundle: hook này chạy sau khi Vite đã
    // gom xong CSS, nên danh sách file mới đầy đủ.
    writeBundle(options, bundle) {
      const js: string[] = [];
      const css: string[] = [];
      for (const file of Object.values(bundle)) {
        if (file.type === 'chunk' && file.isEntry) js.push(file.fileName);
        else if (file.type === 'asset' && file.fileName.endsWith('.css')) css.push(file.fileName);
      }

      const template = JSON.parse(
        readFileSync(path.resolve(__dirname, 'app-config.json'), 'utf8'),
      ) as Record<string, unknown>;

      const out = path.resolve(options.dir ?? 'www', 'app-config.json');
      // listSyncJS chứ không phải listAsyncJS. Zalo không upload index.html mà
      // tự dựng trang rồi chèn script theo ba danh sách này; script trong
      // listAsyncJS chạy bất đồng bộ nên có thể thực thi trước khi <body> được
      // parse, và document.currentScript (Vite dùng để tính đường dẫn ảnh) trở
      // nên không đáng tin. Entry phải nằm ở listSyncJS.
      writeFileSync(
        out,
        `${JSON.stringify({ ...template, listCSS: css, listSyncJS: js, listAsyncJS: [] }, null, 2)}\n`,
      );
    },
  };
}

type Handler = (req: Request) => Response | Promise<Response>;

/**
 * Chạy các Vercel Function trong `api/` ngay trên dev server của Vite. Không có
 * plugin này thì Vite trả luôn mã nguồn `api/leaderboard.ts` cho `/api/leaderboard`
 * và client đọc JSON thất bại.
 *
 * Có KV_REST_API_URL/TOKEN (hoặc UPSTASH_…) trong `.env.local` thì dùng Redis
 * thật; không có thì dùng Redis giả trong bộ nhớ (`api/_memory.ts`).
 */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    apply: 'serve',
    async configureServer(server) {
      // Vite chỉ nạp biến VITE_* vào client; biến của server phải tự nạp.
      const env = loadEnv(server.config.mode, server.config.root, '');
      for (const k of Object.keys(env)) {
        if (/^(KV|UPSTASH)_/.test(k)) process.env[k] ??= env[k];
      }
      const hasRedis =
        (process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL) &&
        (process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN);
      if (!hasRedis) {
        const mem = (await server.ssrLoadModule('/api/_memory.ts')) as {
          memoryPipeline: unknown;
        };
        (globalThis as Record<string, unknown>).__suikaMemoryRedis = mem.memoryPipeline;
        server.config.logger.info('  ➜  API: chưa có Upstash, dùng Redis giả trong bộ nhớ');
      }

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const match = /^\/api\/([\w-]+)\/?$/.exec(url.pathname);
        if (!match) return next();

        try {
          const mod = (await server.ssrLoadModule(`/api/${match[1]}.ts`)) as Record<
            string,
            Handler | undefined
          >;
          const handler = mod[req.method ?? 'GET'];
          if (!handler) {
            res.statusCode = 405;
            return res.end();
          }

          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const body = chunks.length ? Buffer.concat(chunks) : undefined;
          const out = await handler(
            new Request(url, {
              method: req.method,
              headers: req.headers as Record<string, string>,
              body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
            }),
          );

          res.statusCode = out.status;
          out.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await out.arrayBuffer()));
        } catch (e) {
          next(e);
        }
      });
    },
  };
}

/**
 * Bỏ type="module" và crossorigin khỏi index.html. Webview cũ và container nạp
 * file theo đường dẫn nội bộ đều có thể chặn module script vì kiểm tra CORS,
 * kết quả cũng là màn hình trắng. Bundle đã build ở dạng IIFE nên chạy được
 * như script thường.
 */
function classicScriptTags(): Plugin {
  return {
    name: 'classic-script-tags',
    apply: 'build',
    transformIndexHtml(html) {
      return html
        .replace(/<script type="module" crossorigin/g, '<script defer')
        .replace(/<link rel="stylesheet" crossorigin/g, '<link rel="stylesheet"');
    },
  };
}

export default defineConfig({
  plugins: [react(), devApi(), zaloAppConfig(), classicScriptTags()],
  // Đường dẫn tương đối để bundle chạy được cả khi host trong thư mục con
  // hoặc trong webview của Zalo Mini App.
  base: './',
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    host: true,
    port: 5173,
  },
  build: {
    // Zalo Mini App Extension deploy từ thư mục www ở gốc project, không phải dist.
    outDir: 'www',
    // Máy Android cũ chạy Zalo vẫn còn nhiều; es2015 để esbuild hạ cả ?. và ??.
    target: 'es2015',
    modulePreload: false,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
      },
    },
  },
});
