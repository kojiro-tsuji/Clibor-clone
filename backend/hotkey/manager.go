package hotkey

import (
	"context"
	"log"
	"sync"

	"golang.design/x/hotkey"
)

type Manager struct {
	onTrigger     func() // ホットキー検知時に実行するコールバック
	onFifoTrigger func() // FIFOモード検知時に実行するコールバック
	mu            sync.Mutex
	cancel        context.CancelFunc
}

func NewManager(onTrigger func(), onFifoTrigger func()) *Manager {
	return &Manager{
		onTrigger:     onTrigger,
		onFifoTrigger: onFifoTrigger,
	}
}

// Start はホットキー監視を開始します
func (m *Manager) Start(ctx context.Context) {
	m.mu.Lock()
	defer m.mu.Unlock()

	watchCtx, cancel := context.WithCancel(ctx)
	m.cancel = cancel

	// 1. golang.design/x/hotkey による標準ホットキー (Alt + C) の登録
	go func() {
		err := m.registerStandardHotkey(watchCtx)
		if err != nil {
			log.Printf("Failed to register standard hotkey: %v", err)
		}
	}()

	// 2. golang.design/x/hotkey による FIFOホットキー (Ctrl + G) の登録
	go func() {
		err := m.registerFifoHotkey(watchCtx)
		if err != nil {
			log.Printf("Failed to register FIFO hotkey: %v", err)
		}
	}()

	// 3. プラットフォームごとのCtrl2回押し監視
	go m.watchDoubleCtrl(watchCtx)
}

// Stop はホットキー監視を停止します
func (m *Manager) Stop() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.cancel != nil {
		m.cancel()
	}
}

// registerStandardHotkey は Alt + C による標準的なグローバルホットキーを登録します
func (m *Manager) registerStandardHotkey(ctx context.Context) error {
	hk := hotkey.New([]hotkey.Modifier{hotkey.ModAlt}, hotkey.KeyC)
	if err := hk.Register(); err != nil {
		return err
	}
	defer hk.Unregister()

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-hk.Keydown():
			m.onTrigger()
		}
	}
}

// registerFifoHotkey は Ctrl + G による FIFOモード切り替えホットキーを登録します
func (m *Manager) registerFifoHotkey(ctx context.Context) error {
	hk := hotkey.New([]hotkey.Modifier{hotkey.ModCtrl}, hotkey.KeyG)
	if err := hk.Register(); err != nil {
		return err
	}
	defer hk.Unregister()

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-hk.Keydown():
			m.onFifoTrigger()
		}
	}
}
