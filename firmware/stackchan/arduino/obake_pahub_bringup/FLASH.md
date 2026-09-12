# Stack-chan（CoreS3）確認用スケッチの書き込み

**バックアップの取り方・戻し方の正本**はリポ直下の [バックアップと戻し方.md](../../バックアップと戻し方.md)。  
このファイルは確認用 `.ino` を書くときの補足。

動作確認スケッチは今入っている Stack-chan の会話ファームを消す。書く前に必ずバックアップ。

配線: **Port.A** → PaHub（CH0 左目 / CH1 右目 / CH2 ToF）。

この PC の実体: ポートはよく **COM3**。bin は `C:\Users\kazuh\Documents\stackchan_backup\stackchan_backup.bin`。

---

## 順番

1. [バックアップと戻し方.md](../../バックアップと戻し方.md) で Flash を保存する
2. Arduino IDE で `obake_pahub_bringup.ino` を開く
3. ボード **M5CoreS3**、ポート（例 COM3）、書き込む
4. 確認が終わったら同資料の戻し方で bin を書き戻す

ライブラリ: M5Unified、M5GFX、VL53L0X（Pololu）。水平回転はスケッチ内の SCS（追加ライブラリ不要）。
画面タップで足の回転を緊急停止。
