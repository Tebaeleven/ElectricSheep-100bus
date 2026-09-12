const http = require("http");

// Next（client/desktop）の待ち受けポート。client/web の 3000 と衝突しないよう 3100 固定。
// 台帳は scripts/ports.json（desktop_next）。ポートを探して回るとこちらの Web アプリ
// （3000）を掴んでしまう事故が起きるため、**1 ポートだけ**見る。
const DESK_PORT = Number(process.env.DESKTOP_NEXT_PORT) || 3100;

function check(port) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port, path: "/api/companion/status", timeout: 800 },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(false);
          return;
        }
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          try {
            const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            resolve(Array.isArray(data?.pets));
          } catch {
            resolve(false);
          }
        });
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

(async () => {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await check(DESK_PORT)) process.exit(0);
    await new Promise((r) => setTimeout(r, 300));
  }
  console.error(
    `[ghost-companion] desk が 127.0.0.1:${DESK_PORT} で起動していません。` +
      "別ターミナルで `pnpm --dir client/desktop run dev` を起動し、" +
      "ポートの状態は `pnpm ports:check` で確認してください（docs/ports.md）"
  );
  process.exit(1);
})();
