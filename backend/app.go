package backend

import (
	"context"
	"log"
	"time"

	"wails-clibor/backend/clipboard"
	"wails-clibor/backend/db"
	"wails-clibor/backend/hotkey"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx       context.Context
	db        *db.DB
	monitor   *clipboard.Monitor
	hkMgr     *hotkey.Manager
	isVisible bool
}

func NewApp() *App {
	return &App{}
}

// Startup はアプリケーション起動時に呼び出されます。
func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx

	// DB初期化
	database, err := db.NewDB("clibor-wails")
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	a.db = database

	// クリップボード監視開始
	a.monitor = clipboard.NewMonitor(a.db)
	if err := a.monitor.Start(ctx); err != nil {
		log.Printf("Failed to start clipboard monitor: %v", err)
	}

	// ホットキー監視開始 (Ctrl 2回押し、または Alt + C でウィンドウ表示切り替え)
	a.hkMgr = hotkey.NewManager(func() {
		a.ToggleWindow()
	})
	a.hkMgr.Start(ctx)
}

// Shutdown はアプリケーション終了時に呼び出されます。
func (a *App) Shutdown(ctx context.Context) {
	if a.monitor != nil {
		a.monitor.Stop()
	}
	if a.hkMgr != nil {
		a.hkMgr.Stop()
	}
	if a.db != nil {
		_ = a.db.Close()
	}
}

// ToggleWindow はウィンドウの表示・非表示を切り替えます。
func (a *App) ToggleWindow() {
	if a.isVisible {
		wailsRuntime.WindowHide(a.ctx)
		a.isVisible = false
	} else {
		wailsRuntime.WindowShow(a.ctx)
		wailsRuntime.WindowUnminimise(a.ctx)
		a.isVisible = true
	}
}

// HideWindow はウィンドウを明示的に非表示にします。
func (a *App) HideWindow() {
	wailsRuntime.WindowHide(a.ctx)
	a.isVisible = false
}

// --- フロントエンド向け API ---

// GetHistory はクリップボード履歴を取得します。
func (a *App) GetHistory(limit int) []string {
	if a.db == nil {
		return nil
	}
	history, err := a.db.GetHistory(limit)
	if err != nil {
		log.Printf("Failed to get clipboard history: %v", err)
		return nil
	}
	return history
}

// PasteText は指定したテキストをクリップボードに格納し、元のウィンドウにペーストします。
func (a *App) PasteText(text string) {
	// 1. クリップボードへのセット (golang.design/x/clipboard を使う想定)
	// (監視側が自分自身による変更を検知して無限ループするのを防ぐため、
	//  一時的に監視を無効化するか、またはDBの重複回避ロジックで弾く必要があります。
	//  今回はDB側で直近と同一テキストなら無視するロジックが入っています)
	clipboardWriteText(text)

	// 2. ウィンドウを非表示にし、フォーカスを元のアプリに戻す
	a.HideWindow()

	// 3. フォーカス遷移を待つ (非常に短い待機)
	time.Sleep(150 * time.Millisecond)

	// 4. OSに応じた Ctrl+V エミュレーションを実行
	performOSKeyPress()
}

// GetCategories はすべての定型文カテゴリを取得します。
func (a *App) GetCategories() []db.Category {
	if a.db == nil {
		return nil
	}
	categories, err := a.db.GetCategories()
	if err != nil {
		log.Printf("Failed to get categories: %v", err)
		return nil
	}
	return categories
}

// GetPhrases は指定されたカテゴリに属する定型文を取得します。
func (a *App) GetPhrases(categoryID int64) []db.Phrase {
	if a.db == nil {
		return nil
	}
	phrases, err := a.db.GetPhrases(categoryID)
	if err != nil {
		log.Printf("Failed to get phrases: %v", err)
		return nil
	}
	return phrases
}

// AddPhrase は定型文を追加します。
func (a *App) AddPhrase(categoryID int64, title string, content string) bool {
	if a.db == nil {
		return false
	}
	_, err := a.db.SavePhrase(categoryID, title, content)
	if err != nil {
		log.Printf("Failed to add phrase: %v", err)
		return false
	}
	return true
}

// DeletePhrase は定型文を削除します。
func (a *App) DeletePhrase(id int64) bool {
	if a.db == nil {
		return false
	}
	err := a.db.DeletePhrase(id)
	if err != nil {
		log.Printf("Failed to delete phrase: %v", err)
		return false
	}
	return true
}

// SetAutoStart は Windows 起動時の自動起動を設定または解除します。
func (a *App) SetAutoStart(enable bool) bool {
	err := setAutoStart(enable)
	return err == nil
}

// IsAutoStartEnabled は自動起動が有効になっているか取得します。
func (a *App) IsAutoStartEnabled() bool {
	return isAutoStartEnabled()
}
