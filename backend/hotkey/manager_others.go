//go:build !windows

package hotkey

import (
	"context"
	"log"
)

func (m *Manager) watchDoubleCtrl(ctx context.Context) {
	log.Println("Double Ctrl detection is only supported on Windows in this MVP.")
	<-ctx.Done()
}
