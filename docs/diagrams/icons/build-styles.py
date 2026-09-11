#!/usr/bin/env python3
"""icons/*.svg を draw.io の shape=image スタイル文字列に変換して styles.json に書き出す。

draw.io の image= には `data:image/svg+xml,<base64>` 形式（カンマの後に base64、
`base64,` の接頭辞は付けない）を渡す。スタイル文字列は `;` 区切りなので
値の中に `;` が入ってはいけないが、base64 の文字集合は A-Za-z0-9+/= なので安全。
標準ライブラリのみで動作する。
"""

import base64
import json
import pathlib
import sys

ICONS_DIR = pathlib.Path(__file__).resolve().parent
OUTPUT = ICONS_DIR / "styles.json"
MAX_BYTES = 10 * 1024

STYLE_TEMPLATE = (
    "shape=image;verticalLabelPosition=bottom;labelBackgroundColor=none;"
    "verticalAlign=top;aspect=fixed;imageAspect=0;image=data:image/svg+xml,{b64};"
)


def build() -> dict[str, str]:
    styles: dict[str, str] = {}
    for svg_path in sorted(ICONS_DIR.glob("*.svg")):
        raw = svg_path.read_bytes()
        if len(raw) > MAX_BYTES:
            print(f"警告: {svg_path.name} が {MAX_BYTES} バイトを超えています", file=sys.stderr)
        text = raw.decode("utf-8")
        if "viewBox" not in text:
            print(f"警告: {svg_path.name} に viewBox がありません", file=sys.stderr)
        b64 = base64.b64encode(raw).decode("ascii")
        styles[svg_path.stem] = STYLE_TEMPLATE.format(b64=b64)
    return styles


def main() -> int:
    styles = build()
    if not styles:
        print("SVG が見つかりませんでした", file=sys.stderr)
        return 1
    OUTPUT.write_text(json.dumps(styles, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(styles)} 件のスタイルを {OUTPUT} に書き出しました")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
