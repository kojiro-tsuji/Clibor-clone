//go:build windows

package backend

import (
	"context"
	"os"
	"syscall"
	"time"

	"golang.design/x/clipboard"
	"golang.org/x/sys/windows/registry"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

var (
	user32DLL        = syscall.NewLazyDLL("user32.dll")
	keybdEventProc   = user32DLL.NewProc("keybd_event")
	getAsyncKeyState = user32DLL.NewProc("GetAsyncKeyState")
)

const (
	vkControl      = 0x11
	vkV            = 0x56
	keyeventfKeyUp = 0x0002
)

func clipboardWriteText(text string) {
	clipboard.Write(clipboard.FmtText, []byte(text))
}

func performOSKeyPress() {
	// Windows APIの keybd_event を用いて Ctrl + V をシミュレート
	// 1. Ctrl キー押し下げ
	_, _, _ = keybdEventProc.Call(uintptr(vkControl), 0, 0, 0)
	// 2. V キー押し下げ
	_, _, _ = keybdEventProc.Call(uintptr(vkV), 0, 0, 0)

	// 3. V キーリリース
	_, _, _ = keybdEventProc.Call(uintptr(vkV), 0, uintptr(keyeventfKeyUp), 0)
	// 4. Ctrl キーリリース
	_, _, _ = keybdEventProc.Call(uintptr(vkControl), 0, uintptr(keyeventfKeyUp), 0)
}

func setAutoStart(enable bool) error {
	k, _, err := registry.CreateKey(registry.CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\Run`, registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer k.Close()

	if enable {
		exePath, err := os.Executable()
		if err != nil {
			return err
		}
		return k.SetStringValue("CliborWails", exePath)
	} else {
		_ = k.DeleteValue("CliborWails")
		return nil
	}
}

func isAutoStartEnabled() bool {
	k, err := registry.OpenKey(registry.CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\Run`, registry.QUERY_VALUE)
	if err != nil {
		return false
	}
	defer k.Close()

	_, _, err = k.GetStringValue("CliborWails")
	return err == nil
}

func (a *App) watchCtrlV(ctx context.Context) {
	const (
		vkControl = 0x11
		vkV       = 0x56
	)
	ticker := time.NewTicker(30 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			a.fifoMu.Lock()
			isFifo := a.isFifo
			queueLen := len(a.fifoQueue)
			a.fifoMu.Unlock()

			if !isFifo || queueLen == 0 {
				time.Sleep(200 * time.Millisecond) // モード無効時はポーリングを遅くして負荷を下げる
				continue
			}

			// GetAsyncKeyState で Ctrl と V の状態を取得
			retCtrl, _, _ := getAsyncKeyState.Call(uintptr(vkControl))
			retV, _, _ := getAsyncKeyState.Call(uintptr(vkV))
			ctrlDown := (retCtrl & 0x8000) != 0
			vDown := (retV & 0x8000) != 0

			if ctrlDown && vDown {
				a.lastCtrlVMu.Lock()
				timeSinceLast := time.Since(a.lastCtrlV)
				a.lastCtrlVMu.Unlock()

				// クールダウン（350ms）で多重フック（チャタリング）を防止
				if timeSinceLast > 350*time.Millisecond {
					a.lastCtrlVMu.Lock()
					a.lastCtrlV = time.Now()
					a.lastCtrlVMu.Unlock()

					// 別ゴルーチンで非同期にポップアップ処理（デッドロック防止）
					go a.handleCtrlVPressed()
				}
			}
		}
	}
}

func (a *App) handleCtrlVPressed() {
	// OSが現在のクリップボードテキストを貼り付けるのを少し待つ（タイミング調整）
	time.Sleep(100 * time.Millisecond)

	a.fifoMu.Lock()
	defer a.fifoMu.Unlock()

	if !a.isFifo || len(a.fifoQueue) == 0 {
		return
	}

	// 最初の要素（貼り付けられたもの）を削除
	a.fifoQueue = a.fifoQueue[1:]

	if len(a.fifoQueue) > 0 {
		// 次の要素をクリップボードにセットして、次のCtrl+Vに備える (自己コピー無視を呼ぶ)
		nextText := a.fifoQueue[0]
		a.writeClipboardSafely(nextText)
	} else {
		// すべて貼り付け終わったら自動的に通常モードに戻る
		a.isFifo = false
	}

	wailsRuntime.EventsEmit(a.ctx, "fifo-status-changed", a.isFifo, a.fifoQueue)
}
