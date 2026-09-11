# 図のスタイルガイド（draw.io / アイコン中心・文字最小）

AWS 構成図の流儀に合わせ、**図は「アイコン＋短いラベル」だけで読ませる**。説明文は図に書かず、図を貼る README / レポート側の本文で書く。

見本: `docs/diagrams/_template.drawio`（PNG: `docs/diagrams/icons/_template.png`）

## 原則

1. **ノード = アイコン 64px ＋ 下ラベル 1〜3 語**。ラベルは名詞句（"Auth / DB", "WS Client"）。文にしない。
2. **箱の中に箇条書きを書かない**。「・◯◯を行う」「・△△を保存」のような説明は図から追い出す。
3. **線ラベルは 1〜2 語**（`HTTP` / `WS` / `STOP` / `call` / `insert`）。プロトコル名か動詞 1 語まで。
4. **コンテナはグループ名のみ**（"Web App" / "Backend" / "Device"）。左上に 20px のアイコン、その右に名前。中に説明を書かない。
5. **凡例・出典・注釈は図に入れない**。README / レポート本文に書く。
6. **余白を広く取る**。ノード間 120px 以上、コンテナ内の上下は 60px 以上空ける。詰め込むくらいなら図を 2 枚に分ける。
7. **キャンバスは 1600×900**（`pageWidth="1600" pageHeight="900"`）。はみ出したら要素を減らす。
8. **フォント**: Helvetica。ノードラベル 12px、コンテナ名 14px bold、図タイトル 20px bold。
9. **線は orthogonal**（`edgeStyle=orthogonalEdgeStyle;rounded=0`）。交差を減らすため `exitX/exitY` `entryX/entryY` を明示する。

## 線の種類

| 意味 | スタイル | 色 |
| --- | --- | --- |
| 同期呼び出し（HTTP / 関数呼び出し） | 実線 `strokeWidth=2` | `#475569` |
| ストリーム・双方向（WebSocket / MQTT） | 破線 `dashed=1` | `#2563EB` |
| 停止・異常系・緊急停止 | 実線 | `#DC2626` |

コピー用:

```
# 実線 HTTP
edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;strokeColor=#475569;strokeWidth=2;fontSize=11;fontColor=#475569;labelBackgroundColor=#FFFFFF;endArrow=blockThin;endFill=1;
# 破線 WS
edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;dashed=1;strokeColor=#2563EB;strokeWidth=2;fontSize=11;fontColor=#2563EB;labelBackgroundColor=#FFFFFF;endArrow=blockThin;endFill=1;
# 赤 停止系
edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;strokeColor=#DC2626;strokeWidth=2;fontSize=11;fontColor=#DC2626;labelBackgroundColor=#FFFFFF;endArrow=blockThin;endFill=1;
```

## コンテナ

```
rounded=1;arcSize=6;whiteSpace=wrap;html=1;fillColor=#F8FAFC;strokeColor=#CBD5E1;verticalAlign=top;align=left;spacingLeft=40;spacingTop=4;fontSize=14;fontStyle=1;fontColor=#334155;
```

左上のアイコンはコンテナとは別セル（20×20、コンテナ座標 +10 / +6）で置く。

## styles.json の使い方

`docs/diagrams/icons/styles.json` はアイコン名 → draw.io のスタイル文字列（SVG を data URI で埋め込み済み）の辞書。**値をそのまま mxCell の `style` に貼る**だけでアイコンが出る。

```xml
<mxCell id="n_react"
        value="UI"
        style="shape=image;verticalLabelPosition=bottom;labelBackgroundColor=none;verticalAlign=top;aspect=fixed;imageAspect=0;image=data:image/svg+xml,PHN2ZyB...;fontSize=12;fontFamily=Helvetica;fontColor=#0F172A;spacingTop=4;"
        vertex="1" parent="1">
  <mxGeometry x="130" y="200" width="64" height="64" as="geometry"/>
</mxCell>
```

- `styles.json` の値の後ろに `fontSize=12;fontFamily=Helvetica;fontColor=#0F172A;spacingTop=4;` を足すとラベル書式が揃う。
- サイズは通常ノード 64×64、コンテナ左上アイコン 20×20。
- `image=` の中身は `data:image/svg+xml,<base64>`（カンマの直後に base64。`base64,` の接頭辞は付けない）。base64 の文字集合に `;` は現れないのでスタイル文字列が壊れない。

### SVG を足したとき / 更新したとき

```bash
# リポジトリルートで実行
python3 docs/diagrams/icons/build-styles.py
```

`icons/*.svg` を全部読んで `icons/styles.json` を作り直す（Python 標準ライブラリのみ）。SVG は **10KB 以下・`viewBox` 必須**（超えたり欠けたりすると警告が出る）。

## PNG 書き出し

```bash
/Applications/draw.io.app/Contents/MacOS/draw.io -x -f png --scale 1 \
  -o docs/diagrams/icons/_template.png \
  docs/diagrams/_template.drawio
```

自分の図を書き出すときは `-o` と入力パスを差し替える。書き出した PNG は目視で「アイコンが出ているか」「線が要素を貫通していないか」を確認する。

## アイコン一覧

| name | 由来 | ライセンス |
| --- | --- | --- |
| apple | simple-icons `apple` | CC0 1.0 |
| arduino | simple-icons `arduino` | CC0 1.0 |
| bluetooth | simple-icons `bluetooth` | CC0 1.0 |
| chrome | simple-icons `googlechrome` | CC0 1.0 |
| cloudflare | simple-icons `cloudflare` | CC0 1.0 |
| docker | simple-icons `docker` | CC0 1.0 |
| electron | simple-icons `electron` | CC0 1.0 |
| eslint | simple-icons `eslint` | CC0 1.0 |
| espressif | simple-icons `espressif`（ESP32） | CC0 1.0 |
| gemini | simple-icons `googlegemini` | CC0 1.0 |
| github | simple-icons `github` | CC0 1.0 |
| google | simple-icons `google` | CC0 1.0 |
| m5stack | simple-icons `m5stack` | CC0 1.0 |
| mastra | https://mastra.ai/logo.svg のシンボル部を抽出して黒に着色 | Mastra の商標。図中での参照利用のみ |
| mqtt | simple-icons `mqtt` | CC0 1.0 |
| nextjs | simple-icons `nextdotjs` | CC0 1.0 |
| ngrok | simple-icons `ngrok` | CC0 1.0 |
| nodejs | simple-icons `nodedotjs` | CC0 1.0 |
| platformio | simple-icons `platformio` | CC0 1.0 |
| pnpm | simple-icons `pnpm` | CC0 1.0 |
| postgresql | simple-icons `postgresql` | CC0 1.0 |
| prettier | simple-icons `prettier` | CC0 1.0 |
| react | simple-icons `react` | CC0 1.0 |
| shadcnui | simple-icons `shadcnui` | CC0 1.0 |
| socketio | simple-icons `socketdotio` | CC0 1.0 |
| supabase | simple-icons `supabase` | CC0 1.0 |
| tailscale | simple-icons `tailscale` | CC0 1.0 |
| tailwindcss | simple-icons `tailwindcss` | CC0 1.0 |
| turborepo | simple-icons `turborepo` | CC0 1.0 |
| typescript | simple-icons `typescript` | CC0 1.0 |
| vitest | simple-icons `vitest` | CC0 1.0 |
| websocket | 自作（角丸矩形＋白抜き "WS"＋波形） | プロジェクト内自由 |
| wifi | 自作（角丸矩形＋白抜き Wi-Fi 波形） | プロジェクト内自由 |
| zod | simple-icons `zod` | CC0 1.0 |

simple-icons のロゴは CC0 1.0（https://github.com/simple-icons/simple-icons）だが、**各ロゴの商標権は各社に帰属**する。構成図での参照利用にとどめ、自プロダクトのロゴとして使わない。

自作アイコン（`wifi` / `websocket`）は 64×64 の角丸矩形＋白抜き。足すときは同じ形式（`viewBox="0 0 64 64"`、`rx=12`、白の図形/文字）に揃える。
