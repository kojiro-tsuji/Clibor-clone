import { useState, useEffect } from 'react'
import {
  GetHistory,
  PasteText,
  GetCategories,
  GetPhrases,
  AddPhrase,
  DeletePhrase,
  IsFifoMode,
  GetFifoQueue,
  ClearFifoQueue
} from '../wailsjs/go/backend/App'
import { Quit, EventsOn, EventsOff } from '../wailsjs/runtime/runtime'

interface Category {
  id: number
  name: string
  sort_order: number
}

interface Phrase {
  id: number
  category_id: number
  title: string
  content: string
  sort_order: number
}

function App() {
  const [activeTab, setActiveTab] = useState<'history' | 'phrase' | 'settings'>('history')
  const [searchQuery, setSearchQuery] = useState('')
  
  // 履歴データ
  const [history, setHistory] = useState<string[]>([])
  
  // 定型文データ
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [phrases, setPhrases] = useState<Phrase[]>([])
  
  // 新規定型文フォーム
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [isAddingPhrase, setIsAddingPhrase] = useState(false)

  // キーボードナビゲーション用
  const [selectedIndex, setSelectedIndex] = useState<number>(0)

  // FIFO設定用
  const [isFifoMode, setIsFifoMode] = useState(false)
  const [fifoQueue, setFifoQueue] = useState<string[]>([])

  // FIFO初期状態取得とイベント監視
  useEffect(() => {
    IsFifoMode().then((mode) => {
      setIsFifoMode(mode)
    }).catch(err => console.error("Fetch FIFO mode error:", err))

    GetFifoQueue().then((q) => {
      if (q) setFifoQueue(q)
    }).catch(err => console.error("Fetch FIFO queue error:", err))

    EventsOn("fifo-status-changed", (isFifo: boolean, queue: string[]) => {
      setIsFifoMode(isFifo)
      setFifoQueue(queue || [])
    })

    return () => {
      EventsOff("fifo-status-changed")
    }
  }, [])



  const handleClearFifo = () => {
    ClearFifoQueue().catch(err => console.error("Clear FIFO error:", err))
  }



  // 1.5秒ごとに履歴とカテゴリを取得するポーリング
  useEffect(() => {
    const fetchHistory = () => {
      GetHistory(50).then((res) => {
        if (res) setHistory(res)
      }).catch(err => console.error("Fetch history error:", err))
    }

    const fetchCategories = () => {
      GetCategories().then((res: any) => {
        if (res && res.length > 0) {
          setCategories(res)
          if (selectedCategoryId === null) {
            setSelectedCategoryId(res[0].id)
          }
        }
      }).catch(err => console.error("Fetch categories error:", err))
    }

    fetchHistory()
    fetchCategories()

    const interval = setInterval(() => {
      fetchHistory()
    }, 1500)

    return () => clearInterval(interval)
  }, [selectedCategoryId])

  // カテゴリ選択変更時に定型文を取得
  useEffect(() => {
    if (selectedCategoryId !== null) {
      GetPhrases(selectedCategoryId).then((res: any) => {
        if (res) setPhrases(res)
      }).catch(err => console.error("Fetch phrases error:", err))
    }
  }, [selectedCategoryId])

  // 検索フィルタリング後の履歴
  const filteredHistory = history.filter(item => 
    item.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // 検索フィルタリング後の定型文
  const filteredPhrases = phrases.filter(phrase => 
    phrase.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    phrase.content.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // 定型文の追加
  const handleAddPhrase = (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedCategoryId === null || !newTitle.trim() || !newContent.trim()) return

    AddPhrase(selectedCategoryId, newTitle, newContent).then((success: boolean) => {
      if (success) {
        setNewTitle('')
        setNewContent('')
        setIsAddingPhrase(false)
        // 再取得
        GetPhrases(selectedCategoryId).then((res: any) => {
          if (res) setPhrases(res)
        })
      }
    })
  }

  // 定型文の削除
  const handleDeletePhrase = (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    DeletePhrase(id).then((success: boolean) => {
      if (success && selectedCategoryId !== null) {
        GetPhrases(selectedCategoryId).then((res: any) => {
          if (res) setPhrases(res)
        })
      }
    })
  }



  // キーボード操作のリスナー
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeTab === 'history') {
        const listLength = filteredHistory.length
        if (listLength === 0) return

        if (e.key === 'ArrowDown' || e.key === 'j') {
          e.preventDefault()
          setSelectedIndex((prev) => (prev + 1) % listLength)
        } else if (e.key === 'ArrowUp' || e.key === 'k') {
          e.preventDefault()
          setSelectedIndex((prev) => (prev - 1 + listLength) % listLength)
        } else if (e.key === 'Enter' || (e.ctrlKey && e.key.toLowerCase() === 'v')) {
          e.preventDefault()
          if (filteredHistory[selectedIndex]) {
            PasteText(filteredHistory[selectedIndex])
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTab, filteredHistory, selectedIndex])

  useEffect(() => {
    setSelectedIndex(0)
  }, [activeTab, searchQuery])

  return (
    <div className="flex flex-col h-screen bg-[#fdfbf7] text-[#4a3e3d] select-none overflow-hidden font-sans text-xs">
      
      {/* 枠なし移動用ドラッグヘッダー */}
      <header 
        style={{ WebkitAppRegion: 'drag' } as any}
        className="flex items-center px-2.5 py-1.5 bg-[#f4efe6] border-b border-[#e9e3d8] shrink-0 cursor-move drag-area"
      >
        <span className="text-[10px] font-bold text-[#8b7668] font-mono tracking-wider">
          Clibor {isFifoMode && <span className="text-[#5e8b68] ml-1">(FIFO)</span>}
        </span>
      </header>

      {/* 検索バー */}
      <div className="p-2 shrink-0">
        <input
          type="text"
          placeholder={activeTab === 'phrase' ? "定型文を検索..." : "履歴を検索..."}
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            setSelectedIndex(0)
          }}
          className="w-full px-2 py-1 bg-white border border-[#e9e3d8] focus:border-[#c8bdad] rounded text-xs text-[#4a3e3d] placeholder-[#c8bdad]/80 outline-none"
        />
      </div>

      {/* メメインコンテンツエリア */}
      <main className="flex-1 overflow-y-auto px-2 pb-2">
        {/* --- 履歴タブ --- */}
        {activeTab === 'history' && (
          <div className="space-y-0.5">
            {isFifoMode ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-1 py-0.5 border-b border-[#e9e3d8] pb-1">
                  <span className="text-[10px] font-bold text-[#5e8b68]">FIFOキュー ({fifoQueue.length})</span>
                  <button
                    onClick={handleClearFifo}
                    className="text-[9px] text-red-500 hover:underline"
                  >
                    [解除]
                  </button>
                </div>
                {fifoQueue.length === 0 ? (
                  <div className="text-center py-10 text-[#a39485]">
                    <div className="text-xs">連続コピー待機中...</div>
                  </div>
                ) : (
                  <div className="space-y-0.5 max-h-[300px] overflow-y-auto">
                    {fifoQueue.map((item, index) => (
                      <div
                        key={index}
                        className={`flex items-start py-1 px-1.5 border-b border-[#fdfbf7] truncate text-xs ${
                          index === 0
                            ? 'bg-[#eef7ee] text-[#3e603e] font-semibold'
                            : 'text-[#6b5b52]'
                        }`}
                      >
                        <span className="font-mono text-[9px] mr-2 shrink-0">
                          {index === 0 ? '[NEXT]' : `[${index + 1}]`}
                        </span>
                        <span className="truncate break-all leading-normal">
                          {item.replace(/\s+/g, ' ')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="text-center py-10 text-[#a39485]">コピー履歴がありません</div>
            ) : (
              filteredHistory.map((item, index) => (
                <div
                  key={index}
                  onClick={() => PasteText(item)}
                  className={`flex items-center justify-between py-1 px-1.5 cursor-pointer rounded ${
                    selectedIndex === index
                      ? 'bg-[#f5ebd6] text-[#4a3e3d] font-semibold'
                      : 'hover:bg-[#f6f1e8] text-[#6b5b52]'
                  }`}
                >
                  <div className="flex items-center min-w-0 flex-1">
                    <span className="font-mono text-[9px] text-[#a39485] mr-2 shrink-0">
                      {index + 1}.
                    </span>
                    <span className="truncate break-all leading-normal">
                      {item.replace(/\s+/g, ' ')}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* --- 定型文タブ --- */}
        {activeTab === 'phrase' && (
          <div className="space-y-2">
            {/* カテゴリ選択 */}
            <div className="flex space-x-2 overflow-x-auto pb-1 border-b border-[#e9e3d8]">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className={`text-xs font-semibold whitespace-nowrap ${
                    selectedCategoryId === cat.id
                      ? 'text-[#8b7668] underline font-bold'
                      : 'text-[#a39485] hover:text-[#8b7668]'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* 定型文リスト */}
            <div className="space-y-0.5">
              {filteredPhrases.length === 0 ? (
                <div className="text-center py-10 text-[#a39485]">定型文がありません</div>
              ) : (
                filteredPhrases.map((phrase) => (
                  <div
                    key={phrase.id}
                    onClick={() => PasteText(phrase.content)}
                    className="group flex items-center justify-between py-1 px-1.5 hover:bg-[#f6f1e8] rounded cursor-pointer text-[#4a3e3d]"
                  >
                    <div className="min-w-0 flex-1 mr-2">
                      <span className="font-semibold text-[#6b5b52]">{phrase.title}</span>
                      <span className="text-[10px] text-[#a39485] ml-2 truncate">{phrase.content}</span>
                    </div>
                    <button
                      onClick={(e) => handleDeletePhrase(phrase.id, e)}
                      className="opacity-0 group-hover:opacity-100 text-[10px] text-red-500 hover:underline"
                      title="削除"
                    >
                      [✕]
                    </button>
                  </div>
                ))
              )}

              {/* 新規追加ボタン / フォーム */}
              {!isAddingPhrase ? (
                <button
                  onClick={() => setIsAddingPhrase(true)}
                  className="w-full py-1 mt-2 text-center text-[#8b7668] border border-dashed border-[#e9e3d8] hover:bg-[#ede6db] rounded"
                >
                  + 定型文を追加
                </button>
              ) : (
                <form onSubmit={handleAddPhrase} className="bg-[#f4efe6]/40 border border-[#e9e3d8] p-2 rounded space-y-1.5 mt-2">
                  <input
                    type="text"
                    placeholder="タイトル"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full bg-white border border-[#e9e3d8] p-1 rounded text-xs text-[#4a3e3d] placeholder-[#c8bdad]/85 outline-none"
                    required
                  />
                  <textarea
                    placeholder="本文"
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    className="w-full bg-white border border-[#e9e3d8] p-1 rounded text-xs text-[#4a3e3d] placeholder-[#c8bdad]/85 outline-none h-12 resize-none"
                    required
                  />
                  <div className="flex justify-end space-x-2 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setIsAddingPhrase(false)}
                      className="px-2 py-0.5 bg-[#ede6db] hover:bg-[#e2dcd0] text-[#6b5b52] rounded"
                    >
                      キャンセル
                    </button>
                    <button
                      type="submit"
                      className="px-2.5 py-1 rounded text-[9px] font-medium bg-[#8b7668] hover:bg-[#736255] text-white"
                    >
                      保存
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* --- 設定タブ --- */}
        {activeTab === 'settings' && (
          <div className="space-y-2 text-xs">
            {/* キー操作説明 */}
            <div className="py-1.5 border-b border-[#e9e3d8] space-y-1">
              <span className="font-semibold">操作キー</span>
              <div className="text-[10px] text-[#a39485] space-y-0.5">
                <div className="flex justify-between">
                  <span>表示</span>
                  <span>Ctrl 2回 / Alt + C</span>
                </div>
                <div className="flex justify-between">
                  <span>FIFO</span>
                  <span>Ctrl + G</span>
                </div>
                <div className="flex justify-between">
                  <span>移動 (履歴)</span>
                  <span>↑ / ↓ または J / K</span>
                </div>
                <div className="flex justify-between">
                  <span>貼り付け</span>
                  <span>Ctrl + V / Enter</span>
                </div>
              </div>
            </div>

            {/* アプリ情報 */}
            <div className="py-1.5 border-b border-[#e9e3d8] text-[9px] text-[#a39485] space-y-0.5">
              <div>プロダクト: Clibor Clone (Wails MVP)</div>
              <div>バージョン: 1.1.0</div>
              <div className="text-[8px] text-[#b8a38f] mt-1">※PC起動時に自動で常駐を開始します</div>
            </div>

            {/* アプリ終了リンク（極小化） */}
            <div className="text-right pt-2 no-drag-area">
              <button
                onClick={() => Quit()}
                className="text-[9px] text-red-500 hover:underline cursor-pointer"
              >
                [ アプリを完全に終了する ]
              </button>
            </div>
          </div>
        )}
      </main>

      {/* フッターナビゲーションバー */}
      <footer className="flex border-t border-[#e9e3d8] bg-[#f4efe6] shrink-0 text-center text-xs">
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-1.5 font-semibold ${
            activeTab === 'history'
              ? 'bg-[#fdfbf7] text-[#8b7668] border-t-2 border-t-[#8b7668] border-x border-x-[#e9e3d8]'
              : 'text-[#a39485] hover:text-[#8b7668]'
          }`}
        >
          履歴
        </button>
        <button
          onClick={() => setActiveTab('phrase')}
          className={`flex-1 py-1.5 font-semibold ${
            activeTab === 'phrase'
              ? 'bg-[#fdfbf7] text-[#8b7668] border-t-2 border-t-[#8b7668] border-x border-x-[#e9e3d8]'
              : 'text-[#a39485] hover:text-[#8b7668]'
          }`}
        >
          定型文
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex-1 py-1.5 font-semibold ${
            activeTab === 'settings'
              ? 'bg-[#fdfbf7] text-[#8b7668] border-t-2 border-t-[#8b7668] border-x border-x-[#e9e3d8]'
              : 'text-[#a39485] hover:text-[#8b7668]'
          }`}
        >
          設定
        </button>
      </footer>
    </div>
  )
}

export default App
