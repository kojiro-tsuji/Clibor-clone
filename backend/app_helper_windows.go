//go:build windows

package backend

import (
	"os"
	"syscall"

	"golang.design/x/clipboard"
	"golang.org/x/sys/windows/registry"
)

var (
	user32DLL      = syscall.NewLazyDLL("user32.dll")
	keybdEventProc = user32DLL.NewProc("keybd_event")
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
