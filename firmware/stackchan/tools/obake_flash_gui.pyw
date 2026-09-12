# -*- coding: utf-8 -*-
"""
Obake / Stack-chan Flash GUI

バックアップ（16MB 丸ごと）の書き戻しと、おばけちゃん用ファーム
（ESP-IDF build の flasher_args.json）の書き込みを GUI で選んで実行する。
ダブルクリックで起動（.pyw）。Arduino シリアルモニタは閉じること。
"""
from __future__ import annotations

import json
import subprocess
import sys
import threading
import time
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

try:
    import serial.tools.list_ports as list_ports_mod
except ImportError:
    list_ports_mod = None  # 起動時に案内する

# 既定のバックアップ置き場（16MB bin）
DEFAULT_BACKUP_DIR = Path.home() / "Documents" / "stackchan_backup"
# 既定の本番ビルド（Stack-chan / Obake IDF）
DEFAULT_FW_BUILD = (
    Path.home() / "Documents" / "Arduino" / "Stackchan" / "firmware" / "build"
)
# 追加で探すビルド候補（あれば一覧に出す）
EXTRA_FW_BUILDS = [
    Path.home() / "Documents" / "Arduino" / "Obake_device" / "firmware" / "build",
]

CHIP = "esp32s3"
FLASH_SIZE_16MB = 16 * 1024 * 1024
DEFAULT_BAUD = "921600"


def list_com_ports() -> list[str]:
    """接続中の COM ポート名を列挙する。"""
    if list_ports_mod is None:
        return []
    ports = []
    for p in list_ports_mod.comports():
        ports.append(p.device)
    return sorted(ports)


def list_backup_bins(folder: Path) -> list[Path]:
    """バックアップ用 .bin を新しい順で返す。"""
    if not folder.is_dir():
        return []
    bins = [p for p in folder.glob("*.bin") if p.is_file()]
    bins.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return bins


def find_fw_builds() -> list[Path]:
    """flasher_args.json があるビルドディレクトリ候補。"""
    found: list[Path] = []
    for d in [DEFAULT_FW_BUILD, *EXTRA_FW_BUILDS]:
        if (d / "flasher_args.json").is_file():
            found.append(d.resolve())
    arduino = Path.home() / "Documents" / "Arduino"
    if arduino.is_dir():
        for args in arduino.glob("**/firmware/build/flasher_args.json"):
            parent = args.parent.resolve()
            if parent not in found:
                found.append(parent)
    return found


def format_size(n: int) -> str:
    """人間向けサイズ表示。"""
    if n == FLASH_SIZE_16MB:
        return "16 MB（フル）"
    if n >= 1024 * 1024:
        return f"{n / (1024 * 1024):.1f} MB"
    return f"{n} B"


def run_esptool(args: list[str], log_cb) -> int:
    """esptool を実行し、stdout を log_cb へ流す。戻り値は終了コード。"""
    cmd = [sys.executable, "-m", "esptool", *args]
    log_cb("実行: " + " ".join(cmd) + "\n")
    creation = 0
    if sys.platform == "win32":
        creation = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        creationflags=creation,
    )
    assert proc.stdout is not None
    for line in proc.stdout:
        log_cb(line)
    return proc.wait()


class FlashApp(tk.Tk):
    """書き込み GUI 本体。"""

    def __init__(self) -> None:
        super().__init__()
        self.title("Obake Flash GUI")
        self.geometry("720x560")
        self.minsize(640, 480)

        self._busy = False
        self._backup_dir = tk.StringVar(value=str(DEFAULT_BACKUP_DIR))
        self._backup_file = tk.StringVar(value="")
        self._fw_build = tk.StringVar(value="")
        self._port = tk.StringVar(value="")
        self._baud = tk.StringVar(value=DEFAULT_BAUD)
        self._mode = tk.StringVar(value="restore")
        self._bak_paths: dict[str, Path] = {}
        self._fw_paths: dict[str, Path] = {}

        self._build_ui()
        self.refresh_ports()
        self.refresh_backups()
        self.refresh_firmwares()

    def _build_ui(self) -> None:
        """ウィジェット配置。"""
        pad = {"padx": 8, "pady": 4}
        frm = ttk.Frame(self)
        frm.pack(fill=tk.BOTH, expand=True, **pad)

        conn = ttk.LabelFrame(frm, text="接続")
        conn.pack(fill=tk.X, **pad)
        ttk.Label(conn, text="COM").grid(row=0, column=0, sticky=tk.W, **pad)
        self._port_combo = ttk.Combobox(conn, textvariable=self._port, width=14)
        self._port_combo.grid(row=0, column=1, sticky=tk.W, **pad)
        ttk.Button(conn, text="再読込", command=self.refresh_ports).grid(
            row=0, column=2, **pad
        )
        ttk.Label(conn, text="baud").grid(row=0, column=3, sticky=tk.W, **pad)
        ttk.Combobox(
            conn,
            textvariable=self._baud,
            values=["921600", "460800", "115200"],
            width=10,
        ).grid(row=0, column=4, sticky=tk.W, **pad)

        mode = ttk.LabelFrame(frm, text="操作")
        mode.pack(fill=tk.X, **pad)
        ttk.Radiobutton(
            mode,
            text="バックアップを書き戻す（会話ファーム復元）",
            variable=self._mode,
            value="restore",
            command=self._on_mode,
        ).pack(anchor=tk.W, **pad)
        ttk.Radiobutton(
            mode,
            text="おばけちゃん FW を書く（IDF build / flasher_args）",
            variable=self._mode,
            value="firmware",
            command=self._on_mode,
        ).pack(anchor=tk.W, **pad)
        ttk.Radiobutton(
            mode,
            text="いまの Flash をバックアップする（16 MB 読み取り）",
            variable=self._mode,
            value="backup",
            command=self._on_mode,
        ).pack(anchor=tk.W, **pad)

        self._bak_frame = ttk.LabelFrame(frm, text="バックアップ bin")
        self._bak_frame.pack(fill=tk.X, **pad)
        ttk.Label(self._bak_frame, text="フォルダ").grid(
            row=0, column=0, sticky=tk.W, **pad
        )
        ttk.Entry(self._bak_frame, textvariable=self._backup_dir, width=56).grid(
            row=0, column=1, sticky=tk.EW, **pad
        )
        ttk.Button(
            self._bak_frame, text="…", width=3, command=self._pick_backup_dir
        ).grid(row=0, column=2, **pad)
        ttk.Label(self._bak_frame, text="ファイル").grid(
            row=1, column=0, sticky=tk.W, **pad
        )
        self._bak_combo = ttk.Combobox(
            self._bak_frame, textvariable=self._backup_file, width=54
        )
        self._bak_combo.grid(row=1, column=1, sticky=tk.EW, **pad)
        ttk.Button(self._bak_frame, text="更新", command=self.refresh_backups).grid(
            row=1, column=2, **pad
        )
        ttk.Button(
            self._bak_frame, text="他の bin…", command=self._browse_backup_file
        ).grid(row=2, column=1, sticky=tk.W, **pad)
        self._bak_frame.columnconfigure(1, weight=1)

        self._fw_frame = ttk.LabelFrame(frm, text="おばけちゃん FW（build フォルダ）")
        self._fw_frame.pack(fill=tk.X, **pad)
        ttk.Label(self._fw_frame, text="build").grid(
            row=0, column=0, sticky=tk.W, **pad
        )
        self._fw_combo = ttk.Combobox(
            self._fw_frame, textvariable=self._fw_build, width=54
        )
        self._fw_combo.grid(row=0, column=1, sticky=tk.EW, **pad)
        ttk.Button(self._fw_frame, text="更新", command=self.refresh_firmwares).grid(
            row=0, column=2, **pad
        )
        ttk.Button(
            self._fw_frame, text="フォルダ…", command=self._browse_fw_build
        ).grid(row=1, column=1, sticky=tk.W, **pad)
        ttk.Label(
            self._fw_frame,
            text="flasher_args.json がある ESP-IDF の build を選ぶ",
            foreground="#555",
        ).grid(row=2, column=1, sticky=tk.W, **pad)
        self._fw_frame.columnconfigure(1, weight=1)

        act = ttk.Frame(frm)
        act.pack(fill=tk.X, **pad)
        self._run_btn = ttk.Button(act, text="実行", command=self.start_action)
        self._run_btn.pack(side=tk.LEFT, **pad)
        ttk.Label(
            act,
            text="Arduino のシリアルモニタは閉じること",
            foreground="#a00",
        ).pack(side=tk.LEFT, **pad)

        logf = ttk.LabelFrame(frm, text="ログ")
        logf.pack(fill=tk.BOTH, expand=True, **pad)
        self._log = tk.Text(logf, height=16, wrap=tk.WORD)
        self._log.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        sb = ttk.Scrollbar(logf, command=self._log.yview)
        sb.pack(side=tk.RIGHT, fill=tk.Y)
        self._log.configure(yscrollcommand=sb.set)

        self._on_mode()

    def _on_mode(self) -> None:
        """モードに応じてパネルの有効／無効を切り替える。"""
        m = self._mode.get()
        bak_state = "normal" if m in ("restore", "backup") else "disabled"
        fw_state = "normal" if m == "firmware" else "disabled"
        for child in self._bak_frame.winfo_children():
            try:
                child.configure(state=bak_state)
            except tk.TclError:
                pass
        for child in self._fw_frame.winfo_children():
            try:
                child.configure(state=fw_state)
            except tk.TclError:
                pass

    def log(self, text: str) -> None:
        """ログ欄へ追記（スレッドから呼ばれてもよい）。"""

        def _append() -> None:
            self._log.insert(tk.END, text)
            self._log.see(tk.END)

        self.after(0, _append)

    def refresh_ports(self) -> None:
        """COM 一覧を更新する。"""
        ports = list_com_ports()
        self._port_combo["values"] = ports
        if ports and self._port.get() not in ports:
            self._port.set(ports[0])
        elif not ports:
            self._port.set("")
        self.log(f"COM: {', '.join(ports) if ports else '（見つからない）'}\n")

    def refresh_backups(self) -> None:
        """バックアップ bin 一覧を更新する。"""
        folder = Path(self._backup_dir.get())
        bins = list_backup_bins(folder)
        labels = []
        self._bak_paths = {}
        for p in bins:
            label = f"{p.name}  [{format_size(p.stat().st_size)}]"
            labels.append(label)
            self._bak_paths[label] = p
        self._bak_combo["values"] = labels
        if labels:
            self._backup_file.set(labels[0])
        else:
            self._backup_file.set("")
        self.log(f"バックアップ: {len(labels)} 件 in {folder}\n")

    def refresh_firmwares(self) -> None:
        """おばけちゃん FW ビルド一覧を更新する。"""
        builds = find_fw_builds()
        labels = []
        self._fw_paths = {}
        for b in builds:
            name = b.parent.name if b.name == "build" else b.name
            parent = b.parent.parent.name if b.name == "build" else b.parent.name
            label = f"{parent}/{name}  ({b})"
            labels.append(label)
            self._fw_paths[label] = b
        self._fw_combo["values"] = labels
        if labels and not self._fw_build.get():
            self._fw_build.set(labels[0])
        elif labels and self._fw_build.get() not in self._fw_paths:
            if not Path(self._fw_build.get()).is_dir():
                self._fw_build.set(labels[0])
        self.log(f"FW build: {len(labels)} 件\n")

    def _pick_backup_dir(self) -> None:
        """バックアップフォルダを選ぶ。"""
        d = filedialog.askdirectory(initialdir=self._backup_dir.get())
        if d:
            self._backup_dir.set(d)
            self.refresh_backups()

    def _browse_backup_file(self) -> None:
        """任意の bin をバックアップ候補として選ぶ。"""
        path = filedialog.askopenfilename(
            title="バックアップ bin",
            filetypes=[("BIN", "*.bin"), ("すべて", "*.*")],
            initialdir=self._backup_dir.get(),
        )
        if not path:
            return
        p = Path(path)
        label = f"{p.name}  [{format_size(p.stat().st_size)}]"
        self._bak_paths[label] = p
        vals = list(self._bak_combo["values"])
        if label not in vals:
            vals = [label, *vals]
            self._bak_combo["values"] = vals
        self._backup_file.set(label)
        self._backup_dir.set(str(p.parent))

    def _browse_fw_build(self) -> None:
        """flasher_args.json がある build フォルダを選ぶ。"""
        d = filedialog.askdirectory(
            title="IDF build フォルダ（flasher_args.json）",
            initialdir=str(DEFAULT_FW_BUILD),
        )
        if not d:
            return
        build = Path(d)
        if not (build / "flasher_args.json").is_file():
            messagebox.showerror(
                "エラー",
                "このフォルダに flasher_args.json がありません。\n"
                "ESP-IDF の build ディレクトリを選んでください。",
            )
            return
        label = f"手動: {build}"
        self._fw_paths[label] = build.resolve()
        vals = list(self._fw_combo["values"])
        if label not in vals:
            vals = [label, *vals]
            self._fw_combo["values"] = vals
        self._fw_build.set(label)

    def start_action(self) -> None:
        """実行ボタン。別スレッドで esptool を回す。"""
        if self._busy:
            return
        port = self._port.get().strip()
        if not port:
            messagebox.showerror("エラー", "COM ポートを選んでください。")
            return
        baud = self._baud.get().strip() or DEFAULT_BAUD
        mode = self._mode.get()

        if mode == "restore":
            path = self._resolve_backup()
            if path is None:
                return
            if path.stat().st_size != FLASH_SIZE_16MB:
                if not messagebox.askyesno(
                    "サイズ注意",
                    f"この bin は {format_size(path.stat().st_size)} です。\n"
                    "フルバックアップは 16 MB です。それでも書きますか？",
                ):
                    return
            args = [
                "--chip",
                CHIP,
                "-p",
                port,
                "-b",
                baud,
                "write-flash",
                "0",
                str(path),
            ]
            self._run_async(args, f"書き戻し完了: {path.name}")

        elif mode == "firmware":
            build = self._resolve_fw_build()
            if build is None:
                return
            try:
                flash_args = self._fw_write_args(build, port, baud)
            except Exception as e:
                messagebox.showerror("エラー", str(e))
                return
            self._run_async(flash_args, f"FW 書き込み完了: {build}")

        elif mode == "backup":
            folder = Path(self._backup_dir.get())
            folder.mkdir(parents=True, exist_ok=True)
            stamp = time.strftime("%Y%m%d_%H%M%S")
            out = folder / f"stackchan_backup_{stamp}.bin"
            args = [
                "--chip",
                CHIP,
                "-p",
                port,
                "-b",
                baud,
                "read-flash",
                "0",
                "0x1000000",
                str(out),
            ]
            self._run_async(
                args, f"バックアップ完了: {out.name}", after=self.refresh_backups
            )

    def _resolve_backup(self) -> Path | None:
        """選択中のバックアップ Path。"""
        label = self._backup_file.get()
        path = self._bak_paths.get(label)
        if path is None and label:
            cand = Path(label)
            if cand.is_file():
                path = cand
        if path is None or not path.is_file():
            messagebox.showerror("エラー", "バックアップ bin を選んでください。")
            return None
        return path

    def _resolve_fw_build(self) -> Path | None:
        """選択中の FW build ディレクトリ。"""
        label = self._fw_build.get()
        path = self._fw_paths.get(label)
        if path is None and label:
            cand = Path(label)
            if (cand / "flasher_args.json").is_file():
                path = cand
            elif cand.is_dir() and (cand / "build" / "flasher_args.json").is_file():
                path = cand / "build"
        if path is None or not (path / "flasher_args.json").is_file():
            messagebox.showerror(
                "エラー",
                "おばけちゃん FW の build フォルダを選んでください。",
            )
            return None
        return path

    def _fw_write_args(self, build: Path, port: str, baud: str) -> list[str]:
        """flasher_args.json から write-flash 引数を組み立てる。"""
        data = json.loads((build / "flasher_args.json").read_text(encoding="utf-8"))
        files: dict = data.get("flash_files") or {}
        if not files:
            raise RuntimeError("flasher_args.json に flash_files がありません。")
        settings = data.get("flash_settings") or {}
        args = [
            "--chip",
            CHIP,
            "-p",
            port,
            "-b",
            baud,
            "write-flash",
            "--flash-mode",
            settings.get("flash_mode", "dio"),
            "--flash-size",
            settings.get("flash_size", "16MB"),
            "--flash-freq",
            settings.get("flash_freq", "80m"),
        ]
        items = []
        for off, rel in files.items():
            p = (build / rel).resolve()
            if not p.is_file():
                raise RuntimeError(f"見つからない: {p}")
            items.append((int(off, 0), str(p)))
        items.sort(key=lambda x: x[0])
        for off, path in items:
            args.append(hex(off))
            args.append(path)
        return args

    def _run_async(self, args: list[str], ok_msg: str, after=None) -> None:
        """esptool を別スレッドで実行する。"""
        self._busy = True
        self._run_btn.configure(state="disabled")

        def worker() -> None:
            code = 1
            try:
                code = run_esptool(args, self.log)
            except Exception as e:
                self.log(f"例外: {e}\n")
                code = 1

            def done() -> None:
                self._busy = False
                self._run_btn.configure(state="normal")
                if code == 0:
                    self.log(ok_msg + "\n")
                    messagebox.showinfo("完了", ok_msg)
                    if after:
                        after()
                else:
                    messagebox.showerror(
                        "失敗",
                        f"esptool 終了コード {code}\n"
                        "COM・ケーブル・シリアルモニタを確認してください。",
                    )

            self.after(0, done)

        threading.Thread(target=worker, daemon=True).start()


def main() -> None:
    if list_ports_mod is None:
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror(
            "依存不足",
            "pyserial が必要です。\n"
            "pip install pyserial esptool\n"
            "を実行してください。",
        )
        return
    app = FlashApp()
    app.mainloop()


if __name__ == "__main__":
    main()
