package db

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

type DB struct {
	Conn *sql.DB
}

// NewDB はデータベース接続を初期化し、テーブルを作成します。
func NewDB(appName string) (*DB, error) {
	// ユーザーのAppData (Local) またはホームディレクトリ配下にDBを保存する
	baseDir, err := os.UserConfigDir()
	if err != nil {
		// 取得できない場合はカレントディレクトリにフォールバック
		baseDir = "."
	}

	appDir := filepath.Join(baseDir, appName)
	if err := os.MkdirAll(appDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create app directory: %w", err)
	}

	dbPath := filepath.Join(appDir, "clibor.db")
	
	// modernc.org/sqlite ドライバーを使用
	conn, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	db := &DB{Conn: conn}
	if err := db.migrate(); err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to run migrations: %w", err)
	}

	return db, nil
}

// Close はデータベース接続を閉じます。
func (db *DB) Close() error {
	if db.Conn != nil {
		return db.Conn.Close()
	}
	return nil
}

// migrate は必要なテーブルを初期化します。
func (db *DB) migrate() error {
	// 外部キー制約を有効化
	_, err := db.Conn.Exec("PRAGMA foreign_keys = ON;")
	if err != nil {
		return err
	}

	// 履歴テーブル
	historyTable := `
	CREATE TABLE IF NOT EXISTS clipboard_history (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		content TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_history_created_at ON clipboard_history(created_at);
	`

	// 定型文カテゴリテーブル
	categoryTable := `
	CREATE TABLE IF NOT EXISTS categories (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL UNIQUE,
		sort_order INTEGER DEFAULT 0
	);
	`

	// 定型文テーブル
	phraseTable := `
	CREATE TABLE IF NOT EXISTS phrases (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		category_id INTEGER,
		title TEXT NOT NULL,
		content TEXT NOT NULL,
		sort_order INTEGER DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE CASCADE
	);
	`

	queries := []string{historyTable, categoryTable, phraseTable}
	for _, query := range queries {
		if _, err := db.Conn.Exec(query); err != nil {
			return fmt.Errorf("failed executing migration query: %w", err)
		}
	}

	// 初期カテゴリのインサート (空の場合のみ)
	var count int
	err = db.Conn.QueryRow("SELECT COUNT(*) FROM categories").Scan(&count)
	if err == nil && count == 0 {
		_, _ = db.Conn.Exec(`INSERT INTO categories (name, sort_order) VALUES ('デフォルト', 1)`)
	}

	return nil
}

// --- クリップボード履歴 CRUD 操作 ---

// SaveHistory はクリップボード履歴を保存します。直前と同一の場合は保存しません。
func (db *DB) SaveHistory(content string) (int64, error) {
	if content == "" {
		return 0, nil
	}

	// 直近のデータと重複しているかチェック
	var lastContent string
	err := db.Conn.QueryRow("SELECT content FROM clipboard_history ORDER BY id DESC LIMIT 1").Scan(&lastContent)
	if err == nil && lastContent == content {
		return 0, nil // 重複時は無視
	}

	res, err := db.Conn.Exec("INSERT INTO clipboard_history (content) VALUES (?)", content)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// GetHistory は履歴を最新順に取得します。
func (db *DB) GetHistory(limit int) ([]string, error) {
	rows, err := db.Conn.Query("SELECT content FROM clipboard_history ORDER BY id DESC LIMIT ?", limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var history []string
	for rows.Next() {
		var content string
		if err := rows.Scan(&content); err != nil {
			return nil, err
		}
		history = append(history, content)
	}
	return history, nil
}

// AutoCleanHistory は指定された期間（例: 24時間）以上経過した履歴を削除します。
func (db *DB) AutoCleanHistory(olderThan time.Duration) (int64, error) {
	threshold := time.Now().Add(-olderThan).Format("2006-01-02 15:04:05")
	res, err := db.Conn.Exec("DELETE FROM clipboard_history WHERE created_at < ?", threshold)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

type Category struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	SortOrder int    `json:"sort_order"`
}

type Phrase struct {
	ID         int64  `json:"id"`
	CategoryID int64  `json:"category_id"`
	Title      string `json:"title"`
	Content    string `json:"content"`
	SortOrder  int    `json:"sort_order"`
}

// GetCategories はすべてのカテゴリをソート順で取得します。
func (db *DB) GetCategories() ([]Category, error) {
	rows, err := db.Conn.Query("SELECT id, name, sort_order FROM categories ORDER BY sort_order ASC, id ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var categories []Category
	for rows.Next() {
		var c Category
		if err := rows.Scan(&c.ID, &c.Name, &c.SortOrder); err != nil {
			return nil, err
		}
		categories = append(categories, c)
	}
	return categories, nil
}

// GetPhrases は指定されたカテゴリIDに属する定型文を取得します。
func (db *DB) GetPhrases(categoryID int64) ([]Phrase, error) {
	rows, err := db.Conn.Query("SELECT id, category_id, title, content, sort_order FROM phrases WHERE category_id = ? ORDER BY sort_order ASC, id ASC", categoryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var phrases []Phrase
	for rows.Next() {
		var p Phrase
		if err := rows.Scan(&p.ID, &p.CategoryID, &p.Title, &p.Content, &p.SortOrder); err != nil {
			return nil, err
		}
		phrases = append(phrases, p)
	}
	return phrases, nil
}

// SavePhrase は定型文を保存します（新規作成）。
func (db *DB) SavePhrase(categoryID int64, title string, content string) (int64, error) {
	res, err := db.Conn.Exec("INSERT INTO phrases (category_id, title, content) VALUES (?, ?, ?)", categoryID, title, content)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// DeletePhrase は指定されたIDの定型文を削除します。
func (db *DB) DeletePhrase(id int64) error {
	_, err := db.Conn.Exec("DELETE FROM phrases WHERE id = ?", id)
	return err
}
