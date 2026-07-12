//go:build windows

package hotkey

import (
	"context"
	"syscall"
	"time"
)

var (
	user32           = syscall.NewLazyDLL("user32.dll")
	getAsyncKeyState = user32.NewProc("GetAsyncKeyState")
)

func (m *Manager) watchDoubleCtrl(ctx context.Context) {
	const (
		doubleClickThreshold = 300 * time.Millisecond
		vkControl            = 0x11 // VK_CONTROL
	)

	var lastPress time.Time
	ctrlPressed := false

	ticker := time.NewTicker(30 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			// GetAsyncKeyState で Ctrl キーの押下状態を取得
			ret, _, _ := getAsyncKeyState.Call(uintptr(vkControl))
			isDown := (ret & 0x8000) != 0

			if isDown {
				if !ctrlPressed {
					// キーが押された瞬間
					ctrlPressed = true
					now := time.Now()
					if now.Sub(lastPress) < doubleClickThreshold {
						// 2回押し成功
						m.onTrigger()
						lastPress = time.Time{} // リセットして連続実行を防ぐ
					} else {
						lastPress = now
					}
				}
			} else {
				ctrlPressed = false
			}
		}
	}
}
