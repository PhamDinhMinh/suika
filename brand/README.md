# Bộ nhận diện Suika Yatai

Logo **không vẽ tay lại**: trang [`logo.html`](../logo.html) gọi thẳng `drawFruit`
của game ([`src/game/draw.ts`](../src/game/draw.ts)) để vẽ đúng những quả bóng
đang chạy trong game — cùng ảnh nhân vật, cùng vignette theo màu tier, cùng lớp
glass. Đổi art trong `src/assets/bubbles/` rồi xuất lại là logo tự khớp.

## File

| File                                         | Dùng ở đâu                                              |
| -------------------------------------------- | ------------------------------------------------------- |
| `icon-1024.png` … `icon-32.png`              | Icon ứng dụng. Zalo Mini App thường đòi ảnh vuông ≥ 512 |
| `wordmark.png` (1638×512)                    | Ảnh bìa / banner, chỗ cần cả tên game                   |
| `../public/favicon-32.png`, `favicon-64.png` | Tab trình duyệt, đã gắn trong `index.html`              |
| `../public/apple-touch-icon.png`             | Lưu web ra màn hình chính iOS (chính là `icon-180.png`) |

Icon app để **tràn viền vuông, không bo góc** — Zalo, iOS và Android tự bo hoặc
cắt tròn theo chuẩn của họ; bo sẵn là bị bo hai lần.

Favicon là bố cục riêng (một quả to + một quả nhỏ, **có** bo góc): icon app 4 quả
xuống 16px thì thành một đốm màu, còn tab trình duyệt thì không ai bo hộ.

## Vùng an toàn

Trên lưới 512, mọi quả nằm trong vòng tròn bán kính 191px quanh tâm — store cắt
tròn (~205px) hay Android cắt 66% đều không phạm vào quả nào. Trang dựng logo in
số này lên `document.title` mỗi lần vẽ, đổi bố cục thì liếc lại đó.

## Xuất lại

```bash
yarn dev       # rồi chụp từng mode, cỡ cửa sổ phải khớp cỡ canvas
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

"$CHROME" --headless=new --hide-scrollbars --virtual-time-budget=9000 \
  --window-size=1024,1024 --screenshot=brand/icon-1024.png \
  "http://localhost:5173/logo.html?mode=icon"

"$CHROME" --headless=new --hide-scrollbars --virtual-time-budget=9000 \
  --window-size=512,512 --screenshot=/tmp/favicon.png \
  "http://localhost:5173/logo.html?mode=favicon"

"$CHROME" --headless=new --hide-scrollbars --virtual-time-budget=10000 \
  --window-size=1638,512 --screenshot=brand/wordmark.png \
  "http://localhost:5173/logo.html?mode=wordmark"

for s in 512 256 192 180 120 64 32; do
  cp brand/icon-1024.png "brand/icon-$s.png" && sips -Z $s "brand/icon-$s.png"
done
cp brand/icon-180.png public/apple-touch-icon.png
for s in 64 32; do cp /tmp/favicon.png "public/favicon-$s.png" && sips -Z $s "public/favicon-$s.png"; done
```

Hai chỗ dễ vấp:

- **Trần độ phân giải sprite.** Game để bóng tối đa 240px cho nhẹ webview, phóng
  to hơn là mặt nhân vật nhoè. `logo.html` gọi `setSpriteResolution(220)` để nới
  riêng cho lúc dựng logo; game vẫn chạy trần 120 như cũ.
- **Trần nét thật sự là ảnh gốc 320×320** trong `src/assets/bubbles/`. Muốn icon
  nét hơn mức 1024 hiện tại thì phải thay art gốc lớn hơn, nới sprite không cứu
  được.

`logo.html` nằm ngoài `index.html` nên `vite build` không đóng gói nó — chỉ là
trang dev.

## Bản quyền

Logo chỉ là ảnh nhân vật trong `src/assets/bubbles/` đặt vào bóng của game, nên
nó thừa hưởng nguyên lưu ý bản quyền trong
[README của bộ ảnh](../src/assets/bubbles/README.md): art thương mại của người
khác thì không dùng được.
