/**
 * Ảnh nhân vật cho từng tier.
 *
 * Thả file vào `src/assets/bubbles/` đặt tên theo tier — `0.png` là quả nhỏ
 * nhất, `9.png` là quả to nhất (png / jpg / webp đều được). Vite tự gom lúc
 * build, không cần khai báo gì thêm. Tier nào thiếu ảnh thì tự động quay về
 * hoạ tiết vẽ tay trong `draw.ts`.
 */
const files = import.meta.glob<string>('../assets/bubbles/*.{png,jpg,jpeg,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const urls = new Map<number, string>();
for (const [path, url] of Object.entries(files)) {
  const m = /\/(\d+)\.[a-z]+$/i.exec(path);
  if (m) urls.set(Number(m[1]), url);
}

const images = new Map<number, HTMLImageElement>();
const listeners = new Set<() => void>();
let started = false;

export function getArt(tier: number): HTMLImageElement | undefined {
  return images.get(tier);
}

/**
 * Đăng ký nhận báo mỗi khi có ảnh nạp xong. Dành cho canvas vẽ một lần
 * (ô "quả kế tiếp", lộ trình hợp thành) — canvas game tự vẽ lại mỗi frame
 * nên không cần. Trả về hàm huỷ đăng ký.
 */
export function onArtLoaded(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * Nạp toàn bộ ảnh một lần. `onReady` chạy mỗi khi một tier xong để bên gọi
 * huỷ sprite cũ và vẽ lại kèm ảnh.
 */
export function loadArt(onReady: (tier: number) => void) {
  if (started) return;
  started = true;
  for (const [tier, url] of urls) {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      images.set(tier, img);
      onReady(tier); // huỷ sprite cũ trước…
      listeners.forEach((cb) => cb()); // …rồi mới báo cho bên vẽ lại
    };
    img.src = url;
  }
}
