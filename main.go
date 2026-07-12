package main

import (
	"embed"
	"wails-clibor/backend"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

// Wailsフロントエンドビルド成果物の埋め込み
//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// アプリインスタンスの生成
	app := backend.NewApp()

	// Wailsアプリの起動構成設定
	err := wails.Run(&options.App{
		Title:             "Clibor Clone",
		Width:             240,
		Height:            380,
		StartHidden:       false, // 起動時にウィンドウを直接表示する（Webview2の初期化不良を防ぐため）
		AlwaysOnTop:       true, // クリップボードツールとして最前面表示
		Frameless:         true, // スッキリしたUIのために枠なしウィンドウに設定
		BackgroundColour:  &options.RGBA{R: 30, G: 30, B: 30, A: 255},
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		OnStartup:  app.Startup,
		OnShutdown: app.Shutdown,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
