# bench/ — JS 版 vs Wasm 版 の trace 比較用 fixture

`reg-cli` の JS 実装と Rust/Wasm 実装を、**同じ画像セット** に対して走らせて
OTel trace を比較するためのベンチマーク環境。

## ディレクトリ構造

```
bench/
├─ generate.sh             ImageMagick でfixture生成
├─ run.sh                  JS / Wasm を順に実行して out/ に結果を残す
├─ fixtures/               (generate.sh が作る)
│  ├─ expected/001.png..020.png
│  └─ actual/001.png..020.png
└─ out/                    (run.sh が作る)
   ├─ js/{diff,reg.json,report.html,stdout,time.txt}
   └─ wasm/{diff,reg.json,report.html,stdout,time.txt}
```

## 画像 fixture の内訳

- 20 ペア / 1280×720 / 8-bit RGBA PNG
- UI ライクな「ヘッダーバー + 3 枚のカード + プログレスバー + テキストバー」を
  シード付きで描画。配色は index ごとに異なる。
- `actual/NNN.png` は `expected/NNN.png` に対して以下の mutation のどれかを適用:

| index | mutation | 性質 | 期待される diff 比率 |
|-------|----------|------|---------------------|
| 001–004 | `none`   | 変更なし（identity passの計測） | 0% |
| 005–008 | `shift`  | カードを右に 4px 平行移動 | ≈ 1% |
| 009–012 | `hue`    | 全体の色相を 6° 回転（全ピクセル微差） | 100% (最悪ケース) |
| 013–016 | `badge`  | 右上に小さい赤い丸を追加 | ≈ 0.2% |
| 017–018 | `rect`   | 右下に小さい緑の矩形を追加 | ≈ 0.5% |
| 019–020 | `stripe` | ヘッダー下に 4px の細い帯を追加 | ≈ 0.7% |

この分布で以下が一度に測れる:

- **none**: Wasm 側の cold start / thread spawn / decode のオーバーヘッドだけが乗る
  — JS 版との「素の起動コスト差」を見るのに使う
- **shift**: 大きな pixel 変更 → diff output 書き出しが支配的
- **hue**: 全 pixel に差 → decode + 全画素比較のワーストケース
- **badge / rect / stripe**: 差がごく一部 → 「PNG ストリーミングで早期 return できるか」の評価

## 使い方

### 1. fixture 生成

```sh
cd bench
./generate.sh
```

ImageMagick の `magick` コマンドが必要（`brew install imagemagick`）。
フォントは使わないので fontconfig / Ghostscript は不要。

### 2. OTel collector を起動

一番手軽なのは Jaeger all-in-one:

```sh
docker run --rm -d --name jaeger \
  -p 4318:4318 \
  -p 16686:16686 \
  jaegertracing/jaeger:latest
```

### 3. 両実装をビルド

```sh
# classic (JS)
cd ..
npm i
npm run build

# wasm
cd js
pnpm i
pnpm build
cd ..
```

### 4. 実行 & trace 取得

```sh
cd bench
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
./run.sh
```

実行後、Jaeger UI (`http://localhost:16686`) で service=`reg-cli-bench` を
開いて waterfall を比較する。

## trace 比較で見たいポイント

現状 Wasm 版が JS 版より遅い支配項の仮説:

1. **Wasm thread 起動**
   - `new Worker` × N の生成時間
   - `WebAssembly.instantiate` 回数 × 時間
   - これは `none` fixture で特に顕著に出るはず
2. **PNG を streaming decode していない**
   - Rust 側で `fs::read` → 全バイトをまとめて decode
   - `badge` / `stripe` のように差が局所的な fixture で、JS 版なら早期 return できても
     Wasm 版は毎回フル decode している、という仮説の裏取りに使う
3. JS ↔ Wasm boundary / cold start
   - `hue` のワーストケースで Rust 側の純粋計算時間が見たい

trace で特に注目する span:

- JS 側（js/tracing.ts で追加すべき）
  - `node_startup`, `wasm_instantiate`, `worker_spawn`, `postMessage_*`
- Rust 側（reg_core で既に span あり）
  - `build_thread_pool`, `parallel_image_diff`, `read_actual_image`,
    `read_expected_image`, `calculate_diff`
- `image-diff-rs` 内部（span 追加が必要）
  - `decode_png`, `decode_webp`, `compare_pixels`

## 再現性メモ

- `generate.sh` は決定的（index から hue/size を算出）なので、何度走らせても
  同じ PNG が出る。trace を取り直すときに絵を合わせやすい。
- PNG は 8-bit RGBA / `depth=8` / `color-type=6` に正規化している。
  （ImageMagick のデフォは 16-bit になりがちなので要注意）
