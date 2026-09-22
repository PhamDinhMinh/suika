# Ảnh nhân vật trong bóng

Mỗi tier một file, đặt tên theo số tier: `0.png` là quả nhỏ nhất,
`9.png` là quả to nhất (bộ hiện có 10 tier). Định dạng `.png`, `.jpg` hoặc `.webp` đều được.

Vite tự gom qua `import.meta.glob` trong [`src/game/art.ts`](../../game/art.ts) —
thêm/xoá file là xong, không phải khai báo ở đâu cả. Tier nào không có file thì
tự động quay về hoạ tiết trái cây vẽ tay trong `draw.ts`.

## Yêu cầu ảnh

| Mục | Giá trị |
| --- | --- |
| Kích thước | vuông, 320×320 trở lên (512 là đẹp) |
| Bố cục | mặt nhân vật ở giữa, chừa lề ~12% vì ảnh bị cắt tròn |
| Nền | trong suốt là tốt nhất — màu tier sẽ hiện ra sau lưng |
| Dung lượng | ≲ 40 KB/file, cả bộ 10 file nên dưới 500 KB cho webview |

## Bộ đang có

Chibi vẽ tạm bằng canvas, dùng để xem giao diện — thay hết bằng art thật khi có.
Mỗi nhân vật khác nhau ở **dáng tóc + phụ kiện đội đầu + biểu cảm**, vì ở quả nhỏ
nhất (đường kính ~28px) chỉ ba thứ đó còn đọc được, màu thì không đủ:

| Tier | Quả | Nhân vật |
| --- | --- | --- |
| 0 | Anh đào | tóc đuôi ngựa, nơ kem, cười |
| 1 | Dâu tây | hai búi odango, nháy mắt |
| 2 | Nho | mũ phù thuỷ, mắt ngôi sao |
| 3 | Quýt | mũ rơm, cười hở răng nanh |
| 4 | Táo | kính bảo hộ trên trán, mắt hí lạnh lùng |
| 5 | Lê | tóc xoăn, kính tròn |
| 6 | Đào | tóc dài công chúa, vương miện |
| 7 | Dứa | chóp tóc, tai nghe, lè lưỡi |
| 8 | Dưa lưới | mũ trùm đầu, ngái ngủ |
| 9 | Dưa hấu | khăn bandana đỏ + sẹo, cười ngạo |

Khi thay art thật, giữ nguyên nguyên tắc này: đừng để 10 ảnh chỉ khác màu.

Tier "Hồng" (tai mèo + râu) đã bị bỏ khi rút bảng từ 11 xuống 10 quả; ảnh cũ
nằm ở `../bubbles-unused/4.webp` nếu muốn dùng lại.

## Cắt vuông hàng loạt

macOS có sẵn `sips`, không cần cài gì:

```bash
for f in raw/*.png; do
  sips -Z 512 --padToHeightWidth 512 512 "$f" --out "$(basename "$f")"
done
```

Muốn cắt giữa (crop) thay vì thêm lề thì dùng `--cropToHeightWidth`.

## Bản quyền

Ảnh nhân vật từ anime/manga thương mại (One Piece, Naruto, ...) là tài sản có
bản quyền. Zalo Mini App có khâu duyệt và có cơ chế gỡ theo khiếu nại, nên chỉ
dùng art mà bạn có quyền: tự vẽ, đặt vẽ, ảnh AI sinh ra, hoặc asset mua/có giấy
phép thương mại rõ ràng.
