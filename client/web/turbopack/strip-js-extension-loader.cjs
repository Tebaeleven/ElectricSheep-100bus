/**
 * workspace パッケージ（TS ソースを直接読ませている）の相対インポートに付いた
 * `.js` 拡張子を取り除く Turbopack ローダー。
 *
 * `packages/*` は NodeNext 流儀で `./foo.js` と書かれているが、Turbopack は
 * Next プロジェクト（client/web）の外にあるファイルでは `.js` → `.ts` の
 * 解決を行わないため、そのままではビルドできない。
 * packages 側にビルド成果物（dist）を用意するまでの暫定対応。
 */
const RELATIVE_JS_IMPORT = /(from\s*["']\.{1,2}\/[^"']*?)\.js(["'])/g

module.exports = function stripJsExtensionLoader(source) {
  return source.replace(RELATIVE_JS_IMPORT, "$1$2")
}
