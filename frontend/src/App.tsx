import { useState, useEffect } from 'react'
import {
  Clipboard,
  FileText,
  Settings,
  Search,
  Plus,
  Trash2,
  Power,
  Copy,
  X
} from 'lucide-react'
import {
  GetHistory,
  PasteText,
  GetCategories,
  GetPhrases,
  AddPhrase,
  DeletePhrase,
  SetAutoStart,
  IsAutoStartEnabled,
  ToggleFifoMode,
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

  // スタートアップ設定用
  const [isAutoStart, setIsAutoStart] = useState(false)

  // FIFO設定用
  const [isFifoMode, setIsFifoMode] = useState(false)
  const [fifoQueue, setFifoQueue] = useState<string[]>([])

  // 自動起動の初期状態を取得
  useEffect(() => {
    IsAutoStartEnabled().then((enabled) => {
      setIsAutoStart(enabled)
    }).catch(err => console.error("Fetch autostart status error:", err))
  }, [])

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

  const handleToggleFifo = () => {
    ToggleFifoMode().then((mode) => {
      setIsFifoMode(mode)
    }).catch(err => console.error("Toggle FIFO error:", err))
  }

  const handleClearFifo = () => {
    ClearFifoQueue().catch(err => console.error("Clear FIFO error:", err))
  }

  const handleToggleAutoStart = () => {
    const newValue = !isAutoStart
    SetAutoStart(newValue).then((success: boolean) => {
      if (success) {
        setIsAutoStart(newValue)
      }
    }).catch(err => console.error("Toggle autostart error:", err))
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

  // クリップボードにコピー
  const handleCopyToClipboard = (text: string, e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text).then(() => {
      // 成功
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

  // タブが切り替わったら選択インデックスをリセット
  useEffect(() => {
    setSelectedIndex(0)
  }, [activeTab, searchQuery])

  return (
    <div className="flex flex-col h-screen bg-[#fdfbf7] text-[#4a3e3d] select-none overflow-hidden font-sans">
      
      {/* 枠なし移動用ドラッグヘッダー */}
      <header 
        style={{ WebkitAppRegion: 'drag' } as any}
        className="flex items-center justify-between px-4 py-2.5 bg-[#f4efe6] border-b border-[#e9e3d8] shrink-0 cursor-move drag-area"
      >
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${
            isFifoMode ? 'bg-[#5e8b68]' : 'bg-[#b8a38f]'
          }`} />
          <span className="text-[10px] font-bold tracking-wider text-[#8b7668] font-mono">
            CLIBOR CLONE {isFifoMode && <span className="text-[#5e8b68] font-bold ml-1">(FIFO)</span>}
          </span>
        </div>
        <button
          onClick={() => Quit()}
          className="p-1 rounded hover:bg-red-500/5 text-[#a39485] hover:text-red-500 transition-all duration-75 no-drag-area"
          title="アプリ終了"
        >
          <Power size={13} />
        </button>
      </header>

      {/* 検索バー */}
      <div className="p-3 shrink-0">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a39485]" />
          <input
            type="text"
            placeholder={activeTab === 'phrase' ? "定型文を検索..." : "履歴を検索..."}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setSelectedIndex(0)
            }}
            className="w-full pl-8 pr-4 py-1.5 bg-white border border-[#e9e3d8] focus:border-[#c8bdad] rounded-lg text-xs text-[#4a3e3d] placeholder-[#c8bdad]/80 outline-none transition-all duration-75"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* メインコンテンツエリア */}
      <main className="flex-1 overflow-y-auto px-3 pb-3">
        {/* --- 履歴タブ --- */}
        {activeTab === 'history' && (
          <div className="space-y-1">
            {isFifoMode ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1 py-0.5">
                  <span className="text-[10px] font-bold text-[#5e8b68] tracking-wider">FIFO ペースト待機キュー ({fifoQueue.length})</span>
                  <button
                    onClick={handleClearFifo}
                    className="text-[9px] px-2 py-0.5 rounded bg-red-500/5 hover:bg-red-500/10 text-red-650 transition-colors"
                  >
                    解除 & クリア
                  </button>
                </div>
                {fifoQueue.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-[#a39485] space-y-2">
                    <div className="text-xs text-[#8b7668] font-medium">連続コピー待機中...</div>
                    <span className="text-[10px] text-[#a39485] text-center max-w-[200px]">
                      この状態でテキストをコピーすると、ここに順番に溜まります。
                    </span>
                  </div>
                ) : (
                  <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1">
                    {fifoQueue.map((item, index) => (
                      <div
                        key={index}
                        className={`flex items-start p-2 rounded-lg border text-xs ${
                          index === 0
                            ? 'bg-[#eef7ee] border-[#b4dbb4] text-[#3e603e]'
                            : 'bg-[#faf8f5] border-[#f0eae1] text-[#6b5b52]'
                        }`}
                      >
                        <span className={`font-mono text-[9px] px-1 py-0.2 rounded mr-2 shrink-0 ${
                          index === 0 ? 'bg-[#d2edd2] text-[#3e603e] font-bold' : 'bg-[#ede6db] text-[#a39485]'
                        }`}>
                          {index === 0 ? 'NEXT' : index + 1}
                        </span>
                        <span className="truncate break-all pr-2 leading-relaxed">
                          {item.replace(/\s+/g, ' ')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-[#a39485] space-y-2">
                <Clipboard size={22} className="opacity-30" />
                <span className="text-[11px]">コピー履歴がありません</span>
              </div>
            ) : (
              filteredHistory.map((item, index) => (
                <div
                  key={index}
                  onClick={() => PasteText(item)}
                  className={`group flex items-start justify-between p-2 rounded-lg border text-xs cursor-pointer transition-all duration-75 ${
                    selectedIndex === index
                      ? 'bg-[#f5ebd6] border-[#dfcca6] text-[#4a3e3d] font-medium'
                      : 'bg-[#faf8f5] border-[#f0eae1] hover:bg-[#f6f1e8] hover:border-[#dfcca6] text-[#6b5b52]'
                  }`}
                >
                  <div className="flex items-start min-w-0 flex-1">
                    <span className={`font-mono text-[9px] px-1 py-0.2 rounded mr-2 shrink-0 ${
                      selectedIndex === index
                        ? 'bg-[#dfcca6] text-[#8b7668]'
                        : 'bg-[#ede6db] text-[#a39485]'
                    }`}>
                      {index + 1}
                    </span>
                    <span className="truncate break-all pr-2 leading-relaxed">
                      {item.replace(/\s+/g, ' ')}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity duration-100 shrink-0">
                    <button
                      onClick={(e) => handleCopyToClipboard(item, e)}
                      className="p-1 rounded hover:bg-zinc-700/50 text-zinc-400 hover:text-zinc-200"
                      title="クリップボードにコピー"
                    >
                      <Copy size={11} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* --- 定型文タブ --- */}
        {activeTab === 'phrase' && (
          <div className="space-y-3">
            {/* カテゴリ選択 */}
            <div className="flex space-x-1.5 overflow-x-auto pb-1">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className={`px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all duration-75 ${
                    selectedCategoryId === cat.id
                      ? 'bg-[#8b7668] text-white'
                      : 'bg-[#f4efe6] hover:bg-[#ede6db] text-[#8b7668]'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* 定型文リスト */}
            <div className="space-y-1.5">
              {filteredPhrases.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-[#a39485] space-y-1.5">
                  <span className="text-[10px]">定型文が登録されていません</span>
                </div>
              ) : (
                filteredPhrases.map((phrase) => (
                  <div
                    key={phrase.id}
                    onClick={() => PasteText(phrase.content)}
                    className="group flex items-start justify-between p-2 rounded-lg bg-[#faf8f5] border border-[#f0eae1] hover:bg-[#f6f1e8] hover:border-[#dfcca6] text-xs cursor-pointer transition-all duration-75 text-[#4a3e3d]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-[#6b5b52] truncate">{phrase.title}</div>
                      <div className="text-[10px] text-[#a39485] truncate mt-0.5">{phrase.content}</div>
                    </div>
                    <button
                      onClick={(e) => handleDeletePhrase(phrase.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/5 text-[#a39485] hover:text-red-500 transition-all duration-75"
                      title="削除"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))
              )}

              {/* 新規追加ボタン / フォーム */}
              {!isAddingPhrase ? (
                <button
                  onClick={() => setIsAddingPhrase(true)}
                  className="w-full flex items-center justify-center space-x-1.5 py-1.5 bg-[#f4efe6] hover:bg-[#ede6db] border border-dashed border-[#e9e3d8] rounded-lg text-xs text-[#8b7668] hover:text-[#736255] transition-all duration-75"
                >
                  <Plus size={13} />
                  <span>定型文を追加</span>
                </button>
              ) : (
                <form onSubmit={handleAddPhrase} className="bg-[#f4efe6]/40 border border-[#e9e3d8] p-2.5 rounded-lg space-y-2">
                  <div className="text-[10px] font-semibold text-[#8b7668]">定型文の新規作成</div>
                  <input
                    type="text"
                    placeholder="タイトル"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full bg-white border border-[#e9e3d8] focus:border-[#c8bdad] p-1.5 rounded text-xs text-[#4a3e3d] placeholder-[#c8bdad]/80 outline-none"
                    required
                  />
                  <textarea
                    placeholder="本文"
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    className="w-full bg-white border border-[#e9e3d8] focus:border-[#c8bdad] p-1.5 rounded text-xs text-[#4a3e3d] placeholder-[#c8bdad]/80 outline-none h-16 resize-none"
                    required
                  />
                  <div className="flex justify-end space-x-1.5 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setIsAddingPhrase(false)}
                      className="px-2.5 py-1 bg-[#ede6db] hover:bg-[#e2dcd0] text-[#6b5b52] rounded font-medium transition-colors"
                    >
                      キャンセル
                    </button>
                    <button
                      type="submit"
                      className="px-2.5 py-1 rounded text-[9px] font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-all duration-150"
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
          <div className="space-y-3 text-xs">
            {/* スタートアップ設定 */}
            <div className="bg-[#faf8f5] border border-[#f0eae1] p-3 rounded-lg flex items-center justify-between">
              <div>
                <div className="font-semibold text-[#4a3e3d]">スタートアップに登録</div>
                <div className="text-[10px] text-[#a39485] mt-0.5">PC起動時に自動で常駐を開始します</div>
              </div>
              <button
                onClick={handleToggleAutoStart}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-75 focus:outline-none ${
                  isAutoStart ? 'bg-[#8b7668]' : 'bg-[#e2dcd0]'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-75 ease-in-out ${
                    isAutoStart ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* FIFO設定 */}
            <div 
              style={{ WebkitAppRegion: 'no-drag' } as any}
              className="bg-[#faf8f5] border border-[#f0eae1] p-3 rounded-lg flex items-center justify-between"
            >
              <div>
                <div className="font-semibold text-[#4a3e3d]">連続コピー (FIFO) モード</div>
                <div className="text-[10px] text-[#a39485] mt-0.5">コピー順に Ctrl + V で貼り付けられます</div>
              </div>
              <button
                onClick={handleToggleFifo}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-75 focus:outline-none ${
                  isFifoMode ? 'bg-[#8b7668]' : 'bg-[#e2dcd0]'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-75 ease-in-out ${
                    isFifoMode ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="bg-[#faf8f5] border border-[#f0eae1] p-3 rounded-lg space-y-2">
              <div className="font-semibold text-[#4a3e3d]">キーボード操作</div>
              <div className="space-y-1 text-[#a39485]">
                <div className="flex justify-between">
                  <span>ウィンドウ表示</span>
                  <span className="font-mono bg-[#ede6db] px-1 py-0.2 rounded text-[#8b7668]">Ctrl 2回押し / Alt + C</span>
                </div>
                <div className="flex justify-between">
                  <span>連続コピー (FIFO) トグル</span>
                  <span className="font-mono bg-[#ede6db] px-1 py-0.2 rounded text-[#8b7668]">Ctrl + G</span>
                </div>
                <div className="flex justify-between">
                  <span>移動 (履歴)</span>
                  <span className="font-mono bg-[#ede6db] px-1 py-0.2 rounded text-[#8b7668]">↑ / ↓ または J / K</span>
                </div>
                <div className="flex justify-between">
                  <span>貼り付け</span>
                  <span className="font-mono bg-[#ede6db] px-1 py-0.2 rounded text-[#8b7668]">Ctrl + V / Enter</span>
                </div>
              </div>
            </div>

            <div className="bg-[#faf8f5] border border-[#f0eae1] p-3 rounded-lg space-y-1">
              <div className="font-semibold text-[#4a3e3d]">アプリケーション情報</div>
              <div className="text-[#a39485] space-y-0.5">
                <div>プロダクト: Clibor Clone (Wails MVP)</div>
                <div>バージョン: 1.1.0</div>
              </div>
            </div>

            <button
              onClick={() => Quit()}
              className="w-full flex items-center justify-center space-x-1.5 py-2 bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 text-red-650 rounded-lg font-medium transition-all duration-75"
            >
              <Power size={13} />
              <span>アプリケーションを終了する</span>
            </button>
          </div>
        )}
      </main>

      {/* フッターナビゲーションバー */}
      <footer className="flex border-t border-[#e9e3d8] bg-[#f4efe6] shrink-0">
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 flex flex-col items-center justify-center py-2 text-[9px] font-semibold transition-all duration-75 ${
            activeTab === 'history'
              ? 'bg-[#fdfbf7] text-[#8b7668] border-t-2 border-t-[#8b7668] border-x border-x-[#e9e3d8]'
              : 'text-[#a39485] hover:text-[#8b7668]'
          }`}
        >
          <Clipboard size={14} className="mb-0.5" />
          <span>履歴</span>
        </button>
        <button
          onClick={() => setActiveTab('phrase')}
          className={`flex-1 flex flex-col items-center justify-center py-2 text-[9px] font-medium transition-all duration-150 ${
            activeTab === 'phrase'
              ? 'text-indigo-400 bg-white/5'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <FileText size={14} className="mb-1" />
          <span>定型文</span>
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex-1 flex flex-col items-center justify-center py-2 text-[9px] font-medium transition-all duration-150 ${
            activeTab === 'settings'
              ? 'text-indigo-400 bg-white/5'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Settings size={14} className="mb-1" />
          <span>設定</span>
        </button>
      </footer>
    </div>
  )
}

export default App
