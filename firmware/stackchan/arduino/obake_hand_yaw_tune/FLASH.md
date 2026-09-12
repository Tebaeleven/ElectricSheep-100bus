# ハンド yaw 角度チューニング用スケッチ

**バックアップの正本**: リポ直下 [バックアップと戻し方.md](../../バックアップと戻し方.md)

この `.ino` は本番ファームを上書きする。書く前に必ず Flash バックアップ。

## 目的

`hand.set` の開く／閉じる角度（`kHandOpenYawDeg` / `kHandCloseYawDeg`）を決める。  
画面とシリアルに **目標度・フィードバック度・raw** を出し、ボタンで ± して候補を記録する。

## 手順

1. Flash をバックアップする
2. Arduino IDE で `obake_hand_yaw_tune.ino` を開く
3. ボード **M5CoreS3**、ポート（例 COM3）、書き込む
4. シリアル 115200 でも数値を確認
5. 決まった度数を本番の `firmware/main/stackchan/custom/obake/obake_config.h` に反映
6. 確認後、バックアップ bin を書き戻す

ライブラリ: **M5Unified**（追加の SCServo ライブラリは不要。スケッチ内に最小 SCS 実装あり）。
