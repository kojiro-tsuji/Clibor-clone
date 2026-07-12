package clipboard

import (
	"context"
	"log"
	"time"
)

// DBInterface はDB操作に必要なインターフェースを定義します（循環参照を防ぐため）
type DBInterface interface {
	SaveHistory(content string) (int64, error)
	AutoCleanHistory(olderThan time.Duration) (int64, error)
}

type Monitor struct {
	db            DBInterface
	cancel        context.CancelFunc
	onCopy        func(string)
	readClipboard func() (string, error)
}

func NewMonitor(database DBInterface, onCopy func(string), readClipboard func() (string, error)) *Monitor {
	return &Monitor{
		db:            database,
		onCopy:        onCopy,
		readClipboard: readClipboard,
	}
}

// Start はクリップボードの監視を開始します
func (m *Monitor) Start(ctx context.Context) error {
	watchCtx, cancel := context.WithCancel(ctx)
	m.cancel = cancel

	// 1. ポーリングによるクリップボード変更監視
	go func() {
		ticker := time.NewTicker(150 * time.Millisecond) // 150ms 周期で監視
		defer ticker.Stop()

		var lastText string
		// 起動時の初期値をセットして、起動直後の重複保存を防ぐ
		if initial, err := m.readClipboard(); err == nil {
			lastText = initial
		}

		for {
			select {
			case <-watchCtx.Done():
				return
			case <-ticker.C:
				text, err := m.readClipboard()
				if err != nil || text == "" {
					continue
				}

				if text != lastText {
					lastText = text

					if m.onCopy != nil {
						m.onCopy(text)
					}
				}
			}
		}
	}()

	// 2. 過去履歴の自動クリーンアップゴルーチン (1時間ごとに1日以上前のデータを削除)
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()

		// 初回起動時にも実行
		m.clean()

		for {
			select {
			case <-watchCtx.Done():
				return
			case <-ticker.C:
				m.clean()
			}
		}
	}()

	return nil
}

// Stop はクリップボードの監視を停止します
func (m *Monitor) Stop() {
	if m.cancel != nil {
		m.cancel()
	}
}

func (m *Monitor) clean() {
	affected, err := m.db.AutoCleanHistory(24 * time.Hour)
	if err != nil {
		log.Printf("Failed to clean old clipboard history: %v", err)
	} else if affected > 0 {
		log.Printf("Cleaned %d outdated clipboard records", affected)
	}
}
