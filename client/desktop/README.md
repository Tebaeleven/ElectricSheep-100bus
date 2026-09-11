# client/desktop（将来の Tauri v2 デスクトップ版）

会場での常設展示に向けて、`client/web` の Next.js アプリを Tauri v2 でデスクトップアプリとして包む余地をここに確保している。現時点では実装を持たず、Web 版（`client/web`）のみで開発を進める。Tauri を導入する際は、このディレクトリに `src-tauri/` を作り、`beforeDevCommand` で `pnpm --filter web dev` を起動して `http://localhost:3000` を読み込む構成（もしくは `next build` の静的出力を同梱する構成）を検討する。
