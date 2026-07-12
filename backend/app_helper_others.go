//go:build !windows

package backend

import (
	"context"
	"errors"
	"log"
)

func clipboardWriteText(text string) {
	log.Println("Clipboard write is only supported on Windows in this MVP.")
}

func clipboardReadText() (string, error) {
	return "", errors.New("Clipboard read is only supported on Windows in this MVP.")
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
