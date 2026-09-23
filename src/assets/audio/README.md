# Âm thanh

Thư mục này **được phép rỗng** — game vẫn có tiếng. Thiếu file nào thì
[`src/game/audio.ts`](../../game/audio.ts) tự tổng hợp phần đó bằng Web Audio,
giống cách `art.ts` quay về hoạ tiết vẽ tay khi thiếu ảnh.

Muốn thay bằng âm thật thì thả file vào đây, đặt đúng tên:

| File       | Dùng khi              | Gợi ý độ dài            |
| ---------- | --------------------- | ----------------------- |
| `bgm`      | nhạc nền, lặp vô hạn  | 20–60 s, loop liền mạch |
| `drop`     | thả quả xuống hũ      | ≤ 0.3 s                 |
| `merge`    | hai quả gộp thành một | ≤ 0.6 s                 |
| `gameover` | tràn vạch, thua       | ≤ 1.5 s                 |

Đuôi `.mp3`, `.ogg`, `.wav` hoặc `.m4a` đều được — Vite gom qua
`import.meta.glob`, không phải khai báo ở đâu cả.

`merge` được phát lại với `playbackRate` giảm dần theo tier, nên hãy thu ở tông
cao nhất (tier 0) rồi để code tự hạ giọng cho quả to.

## Lưu ý cho Zalo Mini App

- Webview chặn phát tiếng trước cử chỉ người dùng — `AudioContext` chỉ dựng ở
  lần chạm đầu tiên. Đừng chuyển sang `<audio autoplay>`.
- Cả bộ nên dưới ~300 KB. `bgm` để mp3 64–96 kbps mono là đủ.
- Chỉ dùng nhạc bạn có quyền: tự làm, mua, hoặc giấy phép thương mại rõ ràng.
  Nhạc tổng hợp sẵn trong `audio.ts` thì không vướng bản quyền gì.
