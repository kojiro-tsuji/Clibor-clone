//go:build !windows

package backend

import (
	"log"

	"golang.design/x/clipboard"
)

func clipboardWriteText(text string) {
	clipboard.Write(clipboard.FmtText, []byte(text))
}

func performOSKeyPress() {
	log.Println("Paste emulation (Ctrl+V) is only supported on Windows in this MVP.")
}

func setAutoStart(enable bool) error {
	return nil
}

func isAutoStartEnabled() bool {
	return false
}

func (a *App) watchCtrlV(ctx context.Context) {
	<-ctx.Done()
}
