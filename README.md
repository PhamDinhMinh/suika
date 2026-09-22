# Suika Yatai

Game Suika (スイカゲーム) — React + TypeScript + Vite, vật lý bằng Matter.js.

## Chạy

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/
npm run preview
```

## Cấu trúc

| Đường dẫn | Vai trò |
| --- | --- |
| `src/game/fruits.ts` | Bảng 11 loại quả, điểm, hằng số kích thước bàn chơi |
| `src/game/draw.ts` | Vẽ quả: bóng thuỷ tinh có quầng sáng, cache sprite theo tier |
| `src/game/art.ts` | Nạp ảnh nhân vật từ `src/assets/bubbles/` |
| `src/game/engine.ts` | `SuikaGame`: vật lý, input, game loop, game over — **thuần TS, không dính React** |
| `src/components/SuikaBoard.tsx` | Lớp React bọc ngoài: canvas refs, điểm, quả kế tiếp, bố cục |
| `src/components/MergeLadder.tsx` | Cột "Lộ trình hợp thành" bên trái bàn chơi |
| `src/styles/global.css` | Biến màu & nền |

| `src/assets/bubbles/` | Ảnh nhân vật cho từng tier (xem README trong thư mục) |

Điểm cao nhất lưu ở `localStorage` key `suika-best`.

## Bố cục và hướng màn hình

Hai bố cục, tự đổi theo kích thước cửa sổ:

- **Dựng** (< 720px): điểm số ở trên, rồi lộ trình hợp thành nằm sát trái bàn chơi.
- **Ngang** (≥ 720px): ba cột — lộ trình trái, bàn chơi giữa, điểm số phải.
  Khi màn hình thấp (≤ 560px, tức điện thoại xoay ngang) thì bàn chơi bị giới
  hạn bởi chiều cao chứ không phải chiều rộng, và phần đầu trang thu gọn lại.

**Zalo Mini App không hỗ trợ xoay ngang.** `app-config.json` không có field nào
cho orientation — chỉ có `title`, `headerTitle`, `headerColor`, `textColor`,
`statusBarColor`, `leftButton`, `statusBar`, `actionBarHidden`,
`hideAndroidBottomNavigationBar`, `hideIOSSafeAreaBottom`. Muốn ép chơi ngang thì
phải tự xoay nội dung bằng CSS transform bên trong app, và tự ánh xạ lại toạ độ
chạm — `SuikaGame.toLocalX()` trong `src/game/engine.ts` là chỗ duy nhất cần sửa.

## Thay ảnh nhân vật

Thả `0.png` … `10.png` vào `src/assets/bubbles/` — `0` là quả nhỏ nhất. Vite tự
gom lúc build, không cần khai báo. Tier thiếu ảnh thì rơi về hoạ tiết trái cây
vẽ sẵn. Chi tiết kích thước, cách cắt vuông hàng loạt và lưu ý bản quyền nằm
trong [`src/assets/bubbles/README.md`](src/assets/bubbles/README.md).

Quả có ảnh sẽ không lăn theo vật lý (giữ mặt nhân vật thẳng đứng); quả dùng hoạ
tiết vẽ tay thì vẫn lăn.

## Port sang Zalo Mini App

`zmp-cli` cũng chạy React + Vite, nên phần game dùng lại được nguyên vẹn:

```bash
npx zmp-cli init          # tạo project ZMP mới
```

Rồi copy vào project đó:

- `src/game/` — giữ nguyên, không sửa gì
- `src/components/SuikaBoard.tsx` + `SuikaBoard.module.css`
- Nội dung `src/styles/global.css` gộp vào `app.scss` của ZMP

Trong ZMP, render `<SuikaBoard />` bên trong một `<Page>` của `zmp-ui`.

Vài điểm cần lưu ý khi chạy trong webview Zalo:

- `vite.config.ts` đã đặt `base: './'` để asset dùng đường dẫn tương đối.
- `.board` đã có `touch-action: none` và `body` có `overscroll-behavior: none`
  để chặn pull-to-refresh khi kéo ngắm.
- Font Google đang nạp qua `<link>` trong `index.html`. Nếu muốn giảm latency,
  tải font về `public/` rồi khai báo `@font-face` tại chỗ.
- Muốn lưu điểm cao lên server thay vì `localStorage`: sửa `loadBest`/`saveBest`
  trong `src/game/engine.ts`, đó là hai chỗ duy nhất đụng tới storage.
