# 1Clicker

Game HTML5 cho web portal (CrazyGames trước). Phaser 4 + TypeScript, dựng bằng Vite. Quyết định chung của dự án nằm trong `CLAUDE.md` của project Game Making trên claude.ai.

Hiện repo chứa bộ khung chung (`core/`) và một màn demo (`src/`) để kiểm tra bộ khung. Code game thật sẽ thay màn demo.

## Cài đặt

1. Cài Node.js 22 LTS (https://nodejs.org). Kiểm tra bằng `node -v`, cần 22.12 trở lên.
2. Trong thư mục repo chạy `npm install`.

## Lệnh

| Lệnh | Việc |
| --- | --- |
| `npm run dev` | Chạy thử, không có SDK portal. Mở link `Local` trên máy tính |
| `npm run dev:cg` | Chạy thử với SDK CrazyGames v3 ở chế độ local (quảng cáo hiện dòng chữ thay cho quảng cáo thật) |
| `npm run build` | Build cho CrazyGames vào `dist/crazygames`, rồi kiểm tra kích thước và request ra ngoài |
| `npm run build:web` | Build không có SDK vào `dist/web` (để đăng artifact, chạy thử trên điện thoại) |
| `npm run preview` | Phục vụ bản build CrazyGames để thử |
| `npm test` | Test các hàm định dạng số, thời gian, quà hằng ngày |
| `npm run typecheck` | Kiểm tra lỗi TypeScript |
| `npm run sync-core` | Chép bộ khung sang repo game kia (xem mục Bộ khung dùng chung) |
| `npm run sim` | Mô phỏng kinh tế (200 lượt mỗi trường hợp, khoảng 5 phút), ghi `tools/sim/out/report.json` |
| `npm run sim:report` | Dựng trang báo cáo `tools/sim/out/report.html` từ kết quả mô phỏng |

Nộp lên CrazyGames: tải lên nội dung của `dist/crazygames`, với `index.html` nằm ở gốc. Cách tải lên cụ thể (zip hay thư mục) kiểm tra lại trên trang developer lúc nộp.

## Chạy thử trên điện thoại

- Cách nhanh: máy tính và điện thoại cùng Wi-Fi, chạy `npm run dev`, mở link `Network` (dạng `http://192.168.x.x:5173`) trên điện thoại. Windows có thể hỏi cho phép Node qua tường lửa, chọn mạng Private.
- Không cùng mạng: build `npm run build:web` rồi đăng `dist/web` thành artifact riêng tư.

Tham số URL để thử (thêm vào cuối link, ví dụ `?debug&fps=144`):

| Tham số | Tác dụng |
| --- | --- |
| `?debug` | Bảng thông số ở góc dưới: fps, kích thước, độ phân giải, trạng thái tạm dừng, kết quả quảng cáo, dung lượng save. Không sửa được URL (ví dụ trong artifact) thì chạm 5 lần liên tiếp vào tên game ở menu |
| `?fps=144` | Giả lập màn hình 144 Hz để kiểm tra tốc độ không phụ thuộc fps (cũng thử `30`) |
| `?ads=fail` | Quảng cáo luôn báo không có quảng cáo |
| `?ads=none` | Không có SDK quảng cáo, nút quảng cáo tự ẩn |
| `?ads=basic` | Giả lập Basic Launch của CrazyGames: quảng cáo tắt, nút thưởng vẫn cho thưởng |
| `?muteAudio=true` | Portal ép tắt tiếng, nút âm thanh bị khoá |
| `?lang=ru` | Ép ngôn ngữ |
| `?seed=123` | Cố định RNG (chỉ build web), để lặp lại đúng một khoảnh khắc hiếm |
| `?clean` | Ẩn nút quảng cáo, thông báo, bảng debug và con trỏ chuột. Dùng khi quay video |
| `?preset=showcase` hoặc `#showcase` | Mở sẵn bảng đủ cấp và độ hiếm (chỉ build web). Lưu ở khoá riêng, không đè tiến trình thật. Trong artifact chỉ dùng được dạng `#showcase` |
| `#almost` | Một lần ghép nữa là ra Thiên hà (2 Hố đen cạnh nhau): thử màn chúc mừng và lượt chơi tính giờ (chỉ build web, khoá lưu riêng) |
| `#almosttimed` | Lượt tính giờ còn một lần ghép nữa là về đích, có sẵn 4 kỷ lục: thử bảng kỷ lục cá nhân (chỉ build web, khoá lưu riêng) |
| `#starstep` | Vừa xong phần hướng dẫn đầu, sao băng xuất hiện sau 2 giây: thử bước hướng dẫn sao băng (chỉ build web, khoá lưu riêng) |
| `#hidden` | Thiên hà đứng cạnh hành tinh, khí khổng lồ và thiên hà khác, sẵn 300 tinh thể: thử thiên thể ẩn, bộ sưu tập, cửa hàng trang trí (chỉ build web, khoá lưu riêng) |
| `#stuck` | Bảng đầy, không còn cặp ghép, chưa đủ tiền mua ô: thử bảng "Board full" sau 4 giây (chỉ build web, khoá lưu riêng) |

Lần đầu mở một preset là người chơi mới nên vào thẳng màn chơi. Tải lại trang sẽ thấy màn Home của người chơi quay lại.

## Cấu trúc

```
core/        Bộ khung chung. Giống hệt nhau ở 2 repo
  app.ts       Khởi động game, các dịch vụ dùng chung (app.audio, app.save, app.ads, app.t ...)
  viewport.ts  Co giãn 16:9 và màn dọc, nét ở mọi devicePixelRatio
  platform/    Adapter portal: crazygames.ts (SDK v3), local.ts (chạy thử, giả lập quảng cáo)
  ads.ts       Quảng cáo có thưởng và quảng cáo giữa chừng, tạm dừng và tắt tiếng khi chạy
  save.ts      Lưu tiến trình, tự lưu, đổi phiên bản dữ liệu
  i18n.ts      Chuỗi chữ theo ngôn ngữ, tự nhận ngôn ngữ (RU/BE/KK/UK/UZ dùng tiếng Nga)
  audio.ts     Âm thanh, tắt/bật, tôn trọng lệnh tắt tiếng của portal
  pause.ts     Tạm dừng khi chuyển tab hoặc khi có quảng cáo
  fx.ts        Số bay lên, nảy, hạt, rung
  format.ts    Số dạng K/M/B/T, thời lượng, đồng hồ
  time.ts      Thu nhập khi vắng mặt, quà hằng ngày, bước cố định cho kinh tế
  scenes/      Màn loading, menu, tạm dừng, lớp BaseScene
  ui/          Nút, nút quảng cáo có thưởng, nút âm thanh, thông báo ngắn, icon
src/         Code riêng của game này
  game.json    id, tên, màu nền. Không đổi id sau khi phát hành, nếu không save cũ sẽ mất
  main.ts      Cấu hình game: scene, ngôn ngữ, asset, theme
  save.ts      Kiểu dữ liệu lưu
  scenes/      Các màn chơi
  i18n/        File ngôn ngữ (en.json bắt buộc)
public/      Asset (âm thanh, hình). Đóng gói sẵn trong build
scripts/     Kiểm tra build, đồng bộ bộ khung
tests/       Test cho các hàm thuần
tools/       Công cụ tạo asset (âm thanh demo)
```

## Viết một màn chơi

```ts
export class PlayScene extends BaseScene {
  constructor() {
    super('Play', { gameplay: true }); // gameplay: true gửi gameplayStart/Stop cho portal
  }
  protected build() {
    // tạo đối tượng một lần
  }
  protected layout(vp: ViewportInfo) {
    // đặt vị trí theo màn hình hiện tại; chạy lại mỗi lần xoay hoặc đổi kích thước
  }
  update(_time: number, delta: number) {
    // mọi chuyển động nhân với delta (ms), không tính theo số khung hình
  }
}
```

Hệ toạ độ: đơn vị thiết kế. Vùng an toàn luôn là 1280×720 (màn ngang) hoặc 720×1280 (màn dọc), nằm giữa màn hình và luôn hiện đủ. Cạnh dài hơn được thêm chỗ. Đặt UI quan trọng trong `vp.safe`, trải nền ra `vp.width` × `vp.height`. Nút tối thiểu cao 88 đơn vị, chữ tối thiểu 28 để còn đọc được khi khung game nhỏ trên máy tính.

Các dịch vụ dùng qua `app`:

- `app.t('key', { n: 5 })` lấy chuỗi theo ngôn ngữ.
- `app.audio.play('coin', { pitchJitter: 100 })` phát âm thanh.
- `save.data.coins += 10` sửa dữ liệu, bộ khung tự lưu mỗi 5 giây, khi chuyển tab và khi đóng trang.
- `rewardButton(scene, x, y, { label, onReward })` nút xem quảng cáo có thưởng. Thưởng chỉ được trao khi xem xong.
- `app.ads.midgame()` quảng cáo giữa chừng, chỉ gọi ở điểm nghỉ (bộ khung đã gọi khi quay về menu).
- `app.openPause(scene)`, `app.toMenu()` mở màn tạm dừng, về menu.
- `app.platform.happyTime()` khi người chơi đạt thành tích lớn, dùng ít.

## Kinh tế và mô phỏng

- Nội dung và số liệu cân bằng nằm trong `src/content/*.json` (cấp thiên thể, độ hiếm, nâng cấp, giá quét, quảng cáo có thưởng, sao băng).
- `src/logic/` là kinh tế viết bằng TypeScript thuần, không dùng Phaser. Màn chơi và script mô phỏng gọi cùng code này, nên số mô phỏng khớp với game.
- `tools/sim/`:
  - `player.ts`: người chơi giả lập. Giả định về tốc độ nhấp và cách mua ghi ở đầu file.
  - `quick.ts`: kiểm tra nhanh các mốc (`node --experimental-strip-types tools/sim/quick.ts 12`).
  - `tune.ts`: tự định giá nâng cấp theo lịch mục tiêu và khớp đường giá quét. Chạy `--refine` để chỉnh từ số hiện có. Lệnh này ghi đè giá trong `src/content`.
- Sửa số trong JSON xong thì chạy lại `npm run sim` và `npm run sim:report` để xem hệ quả.

## Màn chơi game #1

- `src/scenes/PlayScene.ts`: màn chính, nối `Run` (kinh tế) với giao diện.
- `src/ui/`: bảng kéo thả (`Board`), lõi sao để nhấp (`Core`), thẻ nâng cấp (`UpgradeList`), màn ra đồ hiếm (`Reveal`), sao băng (`ShootingStar`).
- `src/render/`: thiên thể, nền và icon đều vẽ bằng code (Canvas 2D), không có file ảnh. Xem hết 50 thiên thể: `npm run dev` rồi mở `/tools/preview/bodies.html`.
- Hướng dẫn theo bước dùng `Tutorial` của bộ khung; các bước đã xong lưu trong `save.data.tutorial`.

Thêm vào bộ khung trong đợt này: `app.rng` (RNG có seed), `app.moments` (sự kiện khoảnh khắc), `?clean`, `Panel`, bảng thu nhập khi vắng mặt và màn quà 7 ngày (`showOfflinePanel`, `showDailyPanel`), `Tutorial`, nút thưởng có đếm ngược thời gian hồi, `menu: 'returning'`, `contentChecker`.

## Bộ khung dùng chung

Hai game ở 2 repo riêng, mỗi repo có một bản `core/`. Quy ước: chỉ sửa `core/` ở repo Game1_Clicker, rồi chạy `npm run sync-core` trong Game1 để chép sang `../Game2_Tycoon_cafe`. Lệnh này chép `core/`, `scripts/`, `tests/`, `tsconfig.json`, `vite.config.ts` và không đụng vào `src/`.

## Trước khi nộp

- `npm run build` không được có dòng `FAIL`. Lệnh này báo `FAIL` khi quá 1.500 file, quá 250 MB, hoặc tên file có dấu cách hay ký tự ngoài ASCII. Nó báo `WARN` khi tổng trên 8 MB hoặc trong code có tên miền lạ (cần xem có request ra ngoài không).
- Đối chiếu mục 4 và mục 6 trong `CLAUDE.md` của project.
- Ghi nguồn mọi asset mới vào `ASSETS.md`.
