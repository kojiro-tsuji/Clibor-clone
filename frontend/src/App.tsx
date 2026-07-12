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

  // コンテキストメニューと定型文保存モーダル用
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, text: string } | null>(null)
  const [modalText, setModalText] = useState<string>('')
  const [modalTitle, setModalTitle] = useState<string>('')
  const [modalCategoryId, setModalCategoryId] = useState<number>(0)
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)

  // グローバルクリックでコンテキストメニューを閉じる
  useEffect(() => {
    const handleGlobalClick = () => {
      setContextMenu(null)
    }
    window.addEventListener('click', handleGlobalClick)
    return () => window.removeEventListener('click', handleGlobalClick)
  }, [])

  // 定型文ディレクトリの表示モード ('categories' でフォルダ一覧, 'phrases' でフォルダ内定型文一覧)
  const [phraseViewMode, setPhraseViewMode] = useState<'categories' | 'phrases'>('categories')

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

  const handleContextMenu = (e: React.MouseEvent, text: string) => {
    e.preventDefault()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      text: text
    })
  }

  const openSaveModal = (text: string) => {
    setModalText(text)
    setModalTitle(text.substring(0, 10).replace(/\s+/g, ' '))
    setModalCategoryId(selectedCategoryId || (categories[0]?.id || 0))
    setIsModalOpen(true)
    setContextMenu(null)
  }

  const handleSaveFromModal = (e: React.FormEvent) => {
    e.preventDefault()
    if (!modalCategoryId || !modalTitle.trim() || !modalText.trim()) return

    AddPhrase(modalCategoryId, modalTitle, modalText).then((success: boolean) => {
      if (success) {
        setIsModalOpen(false)
        setModalTitle('')
        setModalText('')
        if (selectedCategoryId === modalCategoryId) {
          GetPhrases(modalCategoryId).then((res: any) => {
            if (res) setPhrases(res)
          })
        }
      }
    })
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



  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 検索入力欄にフォーカスがある時はキーボード操作を行わない
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') {
          (document.activeElement as HTMLElement).blur()
        }
        return
      }

      if (activeTab === 'history') {
        const listLength = filteredHistory.length
        if (listLength === 0) return

        if (e.key === 'ArrowDown' || e.key === 'j') {
          e.preventDefault()
          setSelectedIndex((prev) => (prev + 1) % listLength)
        } else if (e.key === 'ArrowUp' || e.key === 'k') {
          e.preventDefault()
          setSelectedIndex((prev) => (prev - 1 + listLength) % listLength)
        } else if (e.ctrlKey && e.key.toLowerCase() === 'v') {
          e.preventDefault()
          if (filteredHistory[selectedIndex]) {
            PasteText(filteredHistory[selectedIndex])
          }
        }
      } else if (activeTab === 'phrase') {
        if (phraseViewMode === 'categories') {
          const listLength = categories.length
          if (listLength === 0) return

          if (e.key === 'ArrowDown' || e.key === 'j') {
            e.preventDefault()
            setSelectedIndex((prev) => (prev + 1) % listLength)
          } else if (e.key === 'ArrowUp' || e.key === 'k') {
            e.preventDefault()
            setSelectedIndex((prev) => (prev - 1 + listLength) % listLength)
          } else if (e.ctrlKey && e.key.toLowerCase() === 'v') {
            e.preventDefault()
            const targetCat = categories[selectedIndex]
            if (targetCat) {
              setSelectedCategoryId(targetCat.id)
              setPhraseViewMode('phrases')
              setSelectedIndex(0)
            }
          }
        } else if (phraseViewMode === 'phrases') {
          // 「戻る」行を含めるため、リストの長さは filteredPhrases.length + 1
          const listLength = filteredPhrases.length + 1

          if (e.key === 'ArrowDown' || e.key === 'j') {
            e.preventDefault()
            setSelectedIndex((prev) => (prev + 1) % listLength)
          } else if (e.key === 'ArrowUp' || e.key === 'k') {
            e.preventDefault()
            setSelectedIndex((prev) => (prev - 1 + listLength) % listLength)
          } else if (e.key === 'ArrowLeft' || e.key === 'h' || e.key === 'Escape') {
            e.preventDefault()
            // 左キーまたはEscでカテゴリ一覧に戻る
            setPhraseViewMode('categories')
            setSelectedIndex(0)
          } else if (e.ctrlKey && e.key.toLowerCase() === 'v') {
            e.preventDefault()
            if (selectedIndex === 0) {
              // 0番目は「戻る」
              setPhraseViewMode('categories')
              setSelectedIndex(0)
            } else {
              const phrase = filteredPhrases[selectedIndex - 1]
              if (phrase) {
                PasteText(phrase.content)
              }
            }
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTab, filteredHistory, categories, phraseViewMode, filteredPhrases, selectedIndex, selectedCategoryId])

  useEffect(() => {
    setSelectedIndex(0)
    setPhraseViewMode('categories')
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
                  onContextMenu={(e) => handleContextMenu(e, item)}
                  style={{ WebkitAppRegion: 'no-drag' } as any}
                  className={`flex items-center justify-between py-1 px-1.5 cursor-pointer rounded no-drag-area ${
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
            {phraseViewMode === 'categories' ? (
              /* --- ディレクトリ（フォルダ）一覧モード --- */
              <div className="space-y-0.5">
                {categories.map((cat, index) => (
                  <div
                    key={cat.id}
                    onClick={() => {
                      setSelectedCategoryId(cat.id)
                      setPhraseViewMode('phrases')
                      setSelectedIndex(0)
                    }}
                    style={{ WebkitAppRegion: 'no-drag' } as any}
                    className={`flex items-center py-1.5 px-2.5 cursor-pointer rounded no-drag-area ${
                      selectedIndex === index
                        ? 'bg-[#f5ebd6] text-[#4a3e3d] font-semibold'
                        : 'hover:bg-[#f6f1e8] text-[#6b5b52]'
                    }`}
                  >
                    <span className="font-mono text-[9px] text-[#a39485] mr-2 shrink-0">📁</span>
                    <span className="truncate leading-normal">{cat.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              /* --- フォルダ内定型文一覧モード --- */
              <div className="space-y-0.5">
                {/* 戻る行 */}
                <div
                  onClick={() => {
                    setPhraseViewMode('categories')
                    setSelectedIndex(0)
                  }}
                  style={{ WebkitAppRegion: 'no-drag' } as any}
                  className={`flex items-center py-1.5 px-2.5 cursor-pointer rounded no-drag-area ${
                    selectedIndex === 0
                      ? 'bg-[#f5ebd6] text-[#4a3e3d] font-semibold'
                      : 'text-[#8b7668] hover:bg-[#f6f1e8]'
                  }`}
                >
                  <span className="font-mono text-[9px] mr-2 shrink-0">⬅</span>
                  <span className="font-semibold leading-normal">.. (戻る)</span>
                </div>

                {/* 定型文リスト */}
                {filteredPhrases.length === 0 ? (
                  <div className="text-center py-10 text-[#a39485]">定型文がありません</div>
                ) : (
                  filteredPhrases.map((phrase, index) => {
                    const itemIndex = index + 1
                    return (
                      <div
                        key={phrase.id}
                        onClick={() => PasteText(phrase.content)}
                        style={{ WebkitAppRegion: 'no-drag' } as any}
                        className={`group flex items-center justify-between py-1 px-1.5 cursor-pointer rounded no-drag-area ${
                          selectedIndex === itemIndex
                            ? 'bg-[#f5ebd6] text-[#4a3e3d] font-semibold'
                            : 'hover:bg-[#f6f1e8] text-[#6b5b52]'
                        }`}
                      >
                        <div className="min-w-0 flex-1 mr-2">
                          <span className="font-semibold text-[#6b5b52]">{phrase.title}</span>
                          <span className="text-[10px] text-[#a39485] ml-2 truncate">{phrase.content}</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeletePhrase(phrase.id, e)
                          }}
                          style={{ WebkitAppRegion: 'no-drag' } as any}
                          className="opacity-0 group-hover:opacity-100 text-[10px] text-red-500 hover:underline no-drag-area"
                          title="削除"
                        >
                          [✕]
                        </button>
                      </div>
                    )
                  })
                )}

                {/* 新規追加ボタン / フォーム */}
                {!isAddingPhrase ? (
                  <button
                    onClick={() => setIsAddingPhrase(true)}
                    style={{ WebkitAppRegion: 'no-drag' } as any}
                    className="w-full py-1 mt-2 text-center text-[#8b7668] border border-dashed border-[#e9e3d8] hover:bg-[#ede6db] rounded no-drag-area"
                  >
                    + 定型文を追加
                  </button>
                ) : (
                  <form onSubmit={handleAddPhrase} style={{ WebkitAppRegion: 'no-drag' } as any} className="bg-[#f4efe6]/40 border border-[#e9e3d8] p-2 rounded space-y-1.5 mt-2 no-drag-area">
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
            )}
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
                  <span>Ctrl 2回</span>
                </div>
                <div className="flex justify-between">
                  <span>コピー</span>
                  <span>Ctrl + C (自動履歴追加)</span>
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
                  <span>貼り付け (決定)</span>
                  <span>Enter</span>
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

      {/* 右クリックコンテキストメニュー */}
      {contextMenu && (
        <div 
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 bg-[#faf8f5] border border-[#dfcca6] rounded shadow-sm text-xs py-1.5 px-3 text-[#4a3e3d] whitespace-nowrap cursor-pointer hover:bg-[#f5ebd6] no-drag-area font-semibold"
          onClick={() => openSaveModal(contextMenu.text)}
        >
          定型文として保存
        </div>
      )}

      {/* 定型文登録モーダル */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 backdrop-blur-[0.5px] no-drag-area">
          <form 
            onSubmit={handleSaveFromModal} 
            className="w-[210px] bg-[#fdfbf7] border border-[#dfcca6] p-3 rounded shadow-md space-y-2 text-xs text-[#4a3e3d]"
          >
            <div className="font-bold text-[#8b7668] border-b border-[#e9e3d8] pb-1">定型文として保存</div>
            
            <div className="space-y-0.5">
              <label className="text-[9px] text-[#a39485] font-semibold">見出し (タイトル)</label>
              <input
                type="text"
                value={modalTitle}
                onChange={(e) => setModalTitle(e.target.value)}
                className="w-full bg-white border border-[#e9e3d8] p-1 rounded text-xs outline-none"
                required
              />
            </div>

            <div className="space-y-0.5">
              <label className="text-[9px] text-[#a39485] font-semibold">保存先カテゴリ</label>
              <select
                value={modalCategoryId}
                onChange={(e) => setModalCategoryId(Number(e.target.value))}
                className="w-full bg-white border border-[#e9e3d8] p-1 rounded text-xs outline-none cursor-pointer"
                required
              >
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-0.5">
              <label className="text-[9px] text-[#a39485] font-semibold">本文 (定型文の内容)</label>
              <textarea
                value={modalText}
                onChange={(e) => setModalText(e.target.value)}
                className="w-full bg-white border border-[#e9e3d8] p-1 rounded text-xs outline-none h-16 resize-none"
                required
              />
            </div>

            <div className="flex justify-end space-x-1.5 text-[10px] pt-1">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-2 py-0.5 bg-[#ede6db] hover:bg-[#e2dcd0] text-[#6b5b52] rounded cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="submit"
                className="px-2.5 py-1 bg-[#8b7668] hover:bg-[#736255] text-white rounded font-semibold cursor-pointer"
              >
                保存
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

export default App
