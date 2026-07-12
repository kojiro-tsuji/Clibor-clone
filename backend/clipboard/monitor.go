package clipboard

import (
	"context"
	"log"
	"time"

	"golang.design/x/clipboard"
)

// DBInterface はDB操作に必要なインターフェースを定義します（循環参照を防ぐため）
type DBInterface interface {
	SaveHistory(content string) (int64, error)
	AutoCleanHistory(olderThan time.Duration) (int64, error)
}

type Monitor struct {
	db     DBInterface
	cancel context.CancelFunc
	onCopy func(string)
}

func NewMonitor(database DBInterface, onCopy func(string)) *Monitor {
	return &Monitor{
		db:     database,
		onCopy: onCopy,
	}
}

// Start はクリップボードの監視を開始します
func (m *Monitor) Start(ctx context.Context) error {
	// golang.design/x/clipboard の初期化
	if err := clipboard.Init(); err != nil {
		return err
	}

	watchCtx, cancel := context.WithCancel(ctx)
	m.cancel = cancel

	// 1. クリップボードの変更監視ゴルーチン
	go func() {
		textChan := clipboard.Watch(watchCtx, clipboard.FmtText)
		for {
			select {
			case <-watchCtx.Done():
				return
			case data, ok := <-textChan:
				if !ok {
					return
				}
				text := string(data)
				if text == "" {
					continue
				}

				// DBへ保存
				_, err := m.db.SaveHistory(text)
				if err != nil {
					log.Printf("Failed to save clipboard history: %v", err)
				}
				if m.onCopy != nil {
					m.onCopy(text)
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
