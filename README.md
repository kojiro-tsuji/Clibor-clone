# Clibor Clone (Wails + React + SQLite)

Wailsフレームワークを使用した、ローカルで動作する軽量・高機能なクリップボード履歴＆定型文管理デスクトップアプリです。

## 特徴 (Features)

- 📋 **クリップボード履歴の自動保存**: バックグラウンドでクリップボードを常時監視し、テキストデータをSQLiteに保存します（1日で自動削除）。
- 🔑 **グローバルホットキー**: `Ctrl`キー2回押し（またはカスタムショートカット）で瞬時に履歴一覧をポップアップ表示。
- ⚡ **自動貼り付け**: 履歴や定型文を選択するだけで、直前にアクティブだったウィンドウに自動でペースト（`Ctrl + V`）。
- 📁 **定型文管理**: よく使うテキストをカテゴリ分けして登録・整理できます。
- 📦 **ポータブル動作**: インストーラーなしで単一の実行ファイル（.exe等）のみで動作可能。

---

## 開発環境のセットアップ (Development Setup)

### 前提条件 (Prerequisites)

- **Go**: 1.21 以上 ([ダウンロード](https://go.dev/dl/))
- **Node.js**: 18 以上 ([ダウンロード](https://nodejs.org/))
- **Wails CLI**: 最新版
  ```bash
  go install github.com/wailsapp/wails/v2/cmd/wails@latest
  ```
- **C/C++ コンパイラ** (Windowsの場合、gcc/g++が必要です。MSYS2やMinGWを推奨)

### ローカル開発の起動 (Local Run)

プロジェクトのルートディレクトリで以下のコマンドを実行します：

```bash
# 依存関係のインストールと開発サーバーの起動
wails dev
```

`wails dev` を実行すると、バックグラウンドのGoプロセスとフロントエンドのVite（React）開発サーバーが起動し、ホットリロードが有効な状態でアプリケーションウィンドウが立ち上がります。

---

## ビルド方法 (Build)

### ローカルでのビルド

現在のOS向けにプロダクション用バイナリをビルドします：

```bash
wails build
```
ビルドされた実行ファイルは `build/bin/` ディレクトリに出力されます。

---

## 技術スタック (Tech Stack)

- **Backend**: Go 1.25+
  - [Wails v2](https://wails.io/) (Desktop Framework)
  - [modernc.org/sqlite](https://modernc.org/sqlite) (純Go実装のSQLiteドライバ。CGO不要でクロスコンパイルが容易)
  - [golang.design/x/clipboard](https://golang.design/x/clipboard) (クリップボード監視)
  - [golang.design/x/hotkey](https://golang.design/x/hotkey) (グローバルホットキー)
- **Frontend**: React, TypeScript, Tailwind CSS
- **CI/CD**: GitHub Actions (Windows/macOS/Linux用バイナリの自動ビルド & リリリース)

---

## ライセンス (License)

MIT License
