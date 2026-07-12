//go:build windows

package backend

import (
	"context"
	"os"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows/registry"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

var (
	user32DLL        = syscall.NewLazyDLL("user32.dll")
	keybdEventProc   = user32DLL.NewProc("keybd_event")
	getAsyncKeyState = user32DLL.NewProc("GetAsyncKeyState")

	openClipboard    = user32DLL.NewProc("OpenClipboard")
	closeClipboard   = user32DLL.NewProc("CloseClipboard")
	emptyClipboard   = user32DLL.NewProc("EmptyClipboard")
	setClipboardData = user32DLL.NewProc("SetClipboardData")
	getClipboardData = user32DLL.NewProc("GetClipboardData")

	kernel32DLL   = syscall.NewLazyDLL("kernel32.dll")
	globalAlloc   = kernel32DLL.NewProc("GlobalAlloc")
	globalFree    = kernel32DLL.NewProc("GlobalFree")
	globalLock    = kernel32DLL.NewProc("GlobalLock")
	globalUnlock  = kernel32DLL.NewProc("GlobalUnlock")
	rtlMoveMemory = kernel32DLL.NewProc("RtlMoveMemory")
)

const (
	vkControl      = 0x11
	vkV            = 0x56
	keyeventfKeyUp = 0x0002
	cfUnicodeText  = 13
	gmemMoveable   = 0x0002
)

func clipboardWriteText(text string) {
	utf16, err := syscall.UTF16FromString(text)
	if err != nil {
		return
	}

	r, _, _ := openClipboard.Call(0)
	if r == 0 {
		return
	}
	defer closeClipboard.Call()

	_, _, _ = emptyClipboard.Call()

	size := uintptr(len(utf16) * 2)
	hMem, _, _ := globalAlloc.Call(gmemMoveable, size)
	if hMem == 0 {
		return
	}

	pMem, _, _ := globalLock.Call(hMem)
	if pMem == 0 {
		_, _, _ = globalFree.Call(hMem)
		return
	}

	_, _, _ = rtlMoveMemory.Call(pMem, uintptr(unsafe.Pointer(&utf16[0])), size)
	_, _, _ = globalUnlock.Call(hMem)

	r, _, _ = setClipboardData.Call(cfUnicodeText, hMem)
	if r == 0 {
		_, _, _ = globalFree.Call(hMem)
	}
}

func clipboardReadText() (string, error) {
	r, _, err := openClipboard.Call(0)
	if r == 0 {
		return "", err
	}
	defer closeClipboard.Call()

	hMem, _, err := getClipboardData.Call(cfUnicodeText)
	if hMem == 0 {
		return "", err
	}

	pMem, _, err := globalLock.Call(hMem)
	if pMem == 0 {
		return "", err
	}
	defer globalUnlock.Call(hMem)

	ptr := (*[1 << 29]uint16)(unsafe.Pointer(pMem))
	length := 0
	for ptr[length] != 0 {
		length++
	}

	utf16Slice := ptr[:length:length]
	return syscall.UTF16ToString(utf16Slice), nil
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
