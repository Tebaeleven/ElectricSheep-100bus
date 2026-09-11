# 資料用ダイアグラム集

ハッカソン発表スライド・README・レビュー説明に使う draw.io 図の置き場。各図は `.drawio`（編集用の正本）と `.png`（貼り付け用の書き出し）の 2 点セットで管理する。

図は **AWS 構成図の流儀＝アイコン中心・文字最小**で描く（スタイル規約は [`STYLE.md`](STYLE.md)）。ノードは「アイコン 64px ＋ 1〜3 語のラベル」だけ、箱の中に箇条書きを書かない、**凡例・出典・注釈は図に入れずこの README に置く**。図は 1600×900 固定。

内容は **develop @ 497e108（2026-09-12 時点）** の実装を読んで作成した実測ベース。図に書いてある数値（テスト件数・ライブラリのバージョン・ポート番号）は推測ではなくファイルの実値・実行結果。

## 一覧（発表推奨順）

| # | ファイル | 図の内容 | スライドでの使い方 |
|---|---|---|---|
| 1 | [`usecase.drawio`](usecase.drawio) / [`usecase.png`](usecase.png) | ユースケース図。アクター 3（利用者 / 家族 / 開発者）× ユースケース 8 | **冒頭の「何ができるか」**。デモの前に 1 枚出して体験の全体像を共有する |
| 2 | [`context.drawio`](context.drawio) / [`context.png`](context.png) | コンテキスト図。Next.js を中心にした外部システム・LAN 機器との接続とプロトコル | **「外と何をやり取りしているか」**。機器チーム・審査員への仕様説明に使う |
| 3 | [`architecture.drawio`](architecture.drawio) / [`architecture.png`](architecture.png) | システムアーキテクチャ図（物理配置）。どのマシン・どのポートで何が動くか | **「どこで何が動くか」**。会場ネットワーク構成の説明、トラブル時の切り分け図 |
| 4 | [`software.drawio`](software.drawio) / [`software.png`](software.png) | ソフトウェアアーキテクチャ図。モノレポの 4 ブロック（`client/web` / `packages/*` / Infra / Tooling） | **「コードの設計」**。技術審査・コードレビューの導入 |
| 5 | [`dependencies.drawio`](dependencies.drawio) / [`dependencies.png`](dependencies.png) | 依存関係図。`@workspace/*` の DAG（上段）と主要外部ライブラリ 10 件のバージョン（下段） | **「依存が循環していないこと」**。バージョン一覧は質疑の回答用 |
| 6 | [`quality.drawio`](quality.drawio) / [`quality.png`](quality.png) | こだわり図。Mock の 3 段 / テスト / 安全設計の 3 カラム | **締めの「こだわり」**。実機ゼロで開発を回した工夫と安全側の設計 |

「外側 → 内側 → 作り方」の順。1〜3 は非エンジニアにも通じる粒度、4〜6 は技術審査向け。時間が短いときは 1・3・6 の 3 枚で足りる。

## 各図の見方と出典

図から説明文を外しているぶん、**話すことはここに書いてある**。スライドの読み原稿として使う。

### 1. ユースケース図

![ユースケース図](usecase.png)

**見方**: 左右のアクター（利用者・家族・開発者）から中央のユースケース 8 個へ線が伸びる。利用者は会話・移動・手の開閉など体験側、開発者は `/dev` からの全 API 手動実行に繋がる。「会話する → 記憶する」だけが `«include»`（会話すると必ず記憶が走る）。右下の赤丸「緊急停止」は誰からでも到達できる安全装置。

**出典**: `docs/specs/robot-api-requirements.md` ／ `README.md` ／ `packages/agent` ／ `client/web`

### 2. コンテキスト図

![コンテキスト図](context.png)

**見方**: 中央が Next.js。左のブラウザとは `HTTP /api/*`、右上の Gemini とは HTTPS、右下の Supabase/Postgres とは REST で繋がる。下の「LAN 機器」コンテナ（API 版は `/api/v1`）に ESP32 レール（`POST /rail/move` 等）とスタックちゃん（`WS /ws/v1/robot`、`hand.set` / `camera.capture` / `audio.start,stop`）が入る。Electron は同一 Mac の `HTTP 127.0.0.1`。赤タグ「IP/認証 未確定」が当日までに詰める唯一の穴。

**出典**: `docs/specs/robot-api-requirements.md` ／ `packages/devices/src/{wire,schemas,constants}.ts` ／ `packages/devices/src/http/*`・`src/ws/stackchan.ts` ／ `client/web/app/api/chat/route.ts` ／ `client/web/lib/devices.ts`・`app/api/devices/**`（12 ルート）／ `client/web/lib/dev/endpoints.ts` ／ `packages/robot/src/http.ts`（`DEFAULT_ENDPOINT_MAP`）／ `client/web/.env.example`

### 3. システムアーキテクチャ図

![システムアーキテクチャ図](architecture.png)

**見方**: 大きな「ローカル PC」コンテナの中に Chat UI・Next.js `:3000`・Agent・Supabase `:54321` / Postgres `:54322`・Mastra Studio `:4111`・Electron が同居する。外に出るのは右の Gemini（HTTPS）と下の「LAN 機器」（ESP32 レールへ HTTP、スタックちゃんへ WS）だけ。Mock `:8791-8793` への破線は `DEVICE_MODE=mock` のときに機器の代わりに繋ぐ先。**トラブル時はこの図のポート番号から切り分ける**。

**出典**: `README.md` ／ `client/web/.env.example`・`next.config.ts`・`app/api/**` ／ `packages/agent/src/mastra/**` ／ `packages/devices/src/{index,constants,mock-servers}.ts` ／ `packages/robot/src/{index,http,mock-server}.ts` ／ `packages/db/src/*.ts` ／ `server/supabase/config.toml` ／ `docs/runbooks/{mastra,devices,supabase}.md`

### 4. ソフトウェアアーキテクチャ図

![ソフトウェアアーキテクチャ図](software.png)

**見方**: 上から `client/web`（UI・shadcn/ui・Route Handlers・`/dev`）→ `packages/*`（agent / devices / robot / db / ui）→ Infra（Gemini・Supabase・Postgres）、右に Tooling（pnpm・Turborepo・vitest・ESLint）。線は 4 本だけで、**`client/web` から `packages/*` への `import` は一方向**。機器アクセスは必ず `packages/devices` 経由で、UI が直接機器やモデルを叩かないのが設計の主張。

**出典**: `pnpm-workspace.yaml`・`turbo.json`・`package.json` ／ `client/web/{next.config.ts,app,components,lib}/**` ／ `packages/{agent,devices,robot,db}/src/**` ／ `packages/ui/components.json` ／ `packages/{eslint-config,typescript-config}` ／ `server/supabase/**` ／ `scripts/wt-setup.sh` ／ `docs/development.md`・`.claude/rules/monorepo.md`・`CLAUDE.md`

### 5. 依存関係図

![依存関係図](dependencies.png)

**見方**: 上段が `@workspace/*` の依存 DAG。左の `web` から右へ矢印が流れるだけで**逆流も循環も無い**（右上の「循環なし」タグ）。下段はアイコン＋「名前 バージョン」で主要外部ライブラリ 10 件。バージョンは `pnpm ls -r --depth 0 --json` の実インストール値。

**出典**: `pnpm-workspace.yaml`（catalog の pin）／ ルートと `client/web`・`packages/*` の `package.json` ／ `pnpm ls -r --depth 0 --json`（表示バージョンの実測）／ `pnpm-lock.yaml` ／ `client/web/next.config.ts`（`serverExternalPackages` / `transpilePackages`）／ 基準: develop = 497e108

### 6. こだわり図

![こだわり図](quality.png)

**見方**: 3 カラム構成。左「Mock の 3 段」はプロセス内モック → モックサーバー `:8791-93` → 実機で、`DEVICE_MODE` 1 つで段を切り替える。中央「テスト」は下から vitest 91 件 → 統合（実 HTTP/WS）→ 手動 `/dev` → E2E（Gemini）のピラミッド。右「安全」は 3000ms 上限・`move` 非再送・`http`/`https` のみ・緊急停止・サーバー経由のみの 5 点。**実機ゼロでも左の 3 段と中央のピラミッドで開発が回った**、が言いたいこと。

**出典**: `packages/devices/src/**`（`{constants,schemas,wire,index,mock-servers}.ts`・`http/rail.ts`・`mock/*`・`{http,ws}/*.test.ts`）／ `packages/robot/src/{mock,mock-server,index}.ts` ／ `packages/agent/src/mastra/storage.ts`・`tools/devices.ts` ／ `packages/db/src/{index,server}.ts` ／ `client/web/app/api/devices/**`（12 ルート）・`client/web/{app/dev,components/dev,lib/dev}/**`（16 エンドポイント）／ `docs/runbooks/{devices,mastra}.md`・`docs/development.md`・`turbo.json`・`package.json`。テスト件数は各パッケージで `pnpm vitest run` を実行した実測値

## 凡例（全図共通）

図の中には凡例を描かないので、単体で配るときはこの節を添える。

### 線

| 見た目 | 意味 |
|---|---|
| 実線・スレート `#475569` | 同期呼び出し（HTTP / REST / 関数呼び出し / `import`） |
| 破線・青 `#2563EB` | ストリーム・双方向（WebSocket・音声チャンク・モックへの接続） |
| 実線・赤 `#DC2626` | 停止・異常系・緊急停止 |

矢印の向きは**要求の向き**。双方向のやり取りは 1 本にせず 2 本で書く。線は orthogonal で、交差ゼロになるよう `exitX/entryX` と waypoint で整形する。

### 塗り

| 色 | 意味 |
|---|---|
| 薄いグレー `#F8FAFC` 枠 `#CBD5E1` | コンテナ（グループの箱）。左上に 20px アイコン＋名前だけ |
| 薄い青 `#EFF6FF` | 強調したいノード・小さな角丸タグ（プロトコル名・API パス・バージョン） |
| グレー `#F1F5F9` | 補助的なタグ・ツール類 |
| 赤 `#DC2626` / 薄赤 `#FEF2F2` | 緊急停止・未確定事項（当日までに詰める場所） |

ノードの色分けは最小限で、**識別はアイコンで行う**（Next.js・Supabase・ESP32 などは公式ロゴ）。アイコンの出典とライセンスは [`STYLE.md`](STYLE.md) の「アイコン一覧」を参照。

## 新しい図を足す・既存の図を直す

1. **[`STYLE.md`](STYLE.md) を読む** — アイコン 64px＋1〜3 語ラベル、箱の中に箇条書きを書かない、線ラベルは 1〜2 語、余白 120px 以上、キャンバス 1600×900、といった規約が全部ここにある
2. **[`_template.drawio`](_template.drawio) をコピーして描き始める** — コンテナ・ノード・3 種の線の見本が入った雛形（書き出し見本は `icons/_template.png`）
3. **アイコンは [`icons/styles.json`](icons/styles.json) から貼る** — アイコン名 → draw.io スタイル文字列（SVG を data URI で埋め込み済み）の辞書。値をそのまま `mxCell` の `style=` に貼り、後ろに `fontSize=12;fontFamily=Helvetica;fontColor=#0F172A;spacingTop=4;` を足すとラベル書式が揃う。サイズは通常ノード 64×64、コンテナ左上アイコン 20×20
4. SVG を足したら `icons/build-styles.py` で `styles.json` を作り直す（リポジトリルートで `python3 docs/diagrams/icons/build-styles.py`）
5. 編集は draw.io デスクトップアプリ（`open -a draw.io docs/diagrams/<name>.drawio`）。保存後 `xmllint --noout docs/diagrams/<name>.drawio` で XML の健全性を確認する

### PNG の再出力

リポジトリルートで実行する。

```bash
/Applications/draw.io.app/Contents/MacOS/draw.io -x -f png --scale 1 \
  -o docs/diagrams/<name>.png docs/diagrams/<name>.drawio
```

6 図まとめて出し直すとき:

```bash
for n in usecase context architecture software dependencies quality; do
  /Applications/draw.io.app/Contents/MacOS/draw.io -x -f png --scale 1 \
    -o "docs/diagrams/$n.png" "docs/diagrams/$n.drawio"
done
```

PNG が 1MB を超えたら縮小する（GitHub 上の表示が重くなるため。現状は全て 1MB 未満）:

```bash
sips -s format png --resampleWidth 2000 docs/diagrams/<name>.png --out docs/diagrams/<name>.png
```

書き出した PNG は目視で「アイコンが出ているか」「線が要素を貫通していないか」を確認し、`.drawio` と `.png` を**必ずセットでコミット**する（PNG だけ古い状態にしない）。

### 実装を変えたら図も直す

図は実装のスナップショットなので、次を変えたら該当図を更新して PNG を出し直し、この README の「見方」「出典」も合わせて直す。

- API エンドポイントの追加・削除 → `context` / `software`
- パッケージ追加・`workspace:*` 依存の変更 → `dependencies` / `software`
- ポート・env・機器の追加 → `architecture` / `context`
- テストの増減・安全上限の変更 → `quality`

冒頭の「基準: develop @ ◯◯」も同時に更新する。
