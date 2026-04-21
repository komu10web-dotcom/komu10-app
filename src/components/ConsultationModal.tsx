'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Send, MessageCircle, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { KAMOKU } from '@/types/database';

// ============================================================
// v0.10.0: AI会計相談モーダル
// 経費入力中 / 既存経費レビュー の両方から呼び出せる
// ============================================================

interface ContextSnapshot {
  transaction_id?: string | null;
  date?: string;
  amount?: number;
  store?: string;
  kamoku?: string;
  item_name?: string;
  description?: string;
  payment_method?: string;
  project_id?: string | null;
  division?: string;
}

interface SimilarTx {
  id: string;
  date: string;
  amount: number;
  store: string | null;
  kamoku: string;
  item_description: string | null;
  project_id: string | null;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  context: ContextSnapshot;
  owner: 'tomo' | 'toshiki';
  // 科目変更を経費入力フォーム側に反映するコールバック（入力中フォームから呼び出された場合）
  onApplyKamoku?: (kamoku: string) => void;
  // 既存経費を更新する場合のコールバック（一覧から呼び出された場合）
  onUpdateTransaction?: (transactionId: string, updates: { kamoku?: string }) => Promise<void>;
  onClose: () => void;
}

export default function ConsultationModal({
  context,
  owner,
  onApplyKamoku,
  onUpdateTransaction,
  onClose,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [consultationId, setConsultationId] = useState<string | null>(null);
  const [suggestedKamoku, setSuggestedKamoku] = useState<string | null>(null);
  const [similarOpen, setSimilarOpen] = useState(false);
  const [similarStore, setSimilarStore] = useState<SimilarTx[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 初回起動時、AIに自動で相談開始
  useEffect(() => {
    handleSend(null, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // メッセージ更新時に自動スクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (textOverride: string | null = null, isInitial: boolean = false) => {
    const userText = textOverride !== null ? textOverride : input.trim();
    if (!isInitial && !userText) return;

    setLoading(true);
    setError(null);

    // 楽観的UI更新（ユーザー発言を即座に表示）
    const newMessages = isInitial
      ? messages
      : [...messages, { role: 'user' as const, content: userText }];
    setMessages(newMessages);
    if (!isInitial) setInput('');

    try {
      const res = await fetch('/api/consultations/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context,
          owner,
          messages: isInitial ? [] : newMessages,
          userMessage: isInitial ? null : userText,
          consultationId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.details || errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setMessages(data.messages || []);
      setConsultationId(data.consultationId);
      setSuggestedKamoku(data.suggestedKamoku || null);

      // 初回時は類似取引を取得して保存（API側で取得済みだが、UIには別途取得）
      if (isInitial && context.store) {
        fetchSimilarStore();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '相談に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const fetchSimilarStore = async () => {
    if (!context.store) return;
    try {
      const { getSupabaseClient } = await import('@/lib/supabase');
      const supabase = getSupabaseClient();
      const { data } = await supabase
        .from('transactions')
        .select('id, date, amount, store, kamoku, item_description, project_id')
        .eq('owner', owner)
        .eq('tx_type', 'expense')
        .eq('store', context.store)
        .order('date', { ascending: false })
        .limit(5);
      setSimilarStore(data || []);
    } catch {
      // 類似取得失敗は無視
    }
  };

  // 「この科目で確定」ボタン
  const handleApplyKamoku = async () => {
    if (!suggestedKamoku) return;
    setApplying(true);
    try {
      // 既存経費の場合: DB更新
      if (context.transaction_id && onUpdateTransaction) {
        await onUpdateTransaction(context.transaction_id, { kamoku: suggestedKamoku });
      }
      // 入力中フォームの場合: 親フォームのstateに反映
      if (onApplyKamoku) {
        onApplyKamoku(suggestedKamoku);
      }
      // resolution を保存
      if (consultationId) {
        await fetch('/api/consultations/ask', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            consultationId,
            resolution: 'kamoku_changed',
            resolvedKamoku: suggestedKamoku,
          }),
        });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '適用に失敗しました');
    } finally {
      setApplying(false);
    }
  };

  // 類似取引を即適用
  const handleApplySimilar = async (similar: SimilarTx) => {
    setApplying(true);
    try {
      if (context.transaction_id && onUpdateTransaction) {
        await onUpdateTransaction(context.transaction_id, { kamoku: similar.kamoku });
      }
      if (onApplyKamoku) {
        onApplyKamoku(similar.kamoku);
      }
      if (consultationId) {
        await fetch('/api/consultations/ask', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            consultationId,
            resolution: 'kamoku_changed',
            resolvedKamoku: similar.kamoku,
          }),
        });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '適用に失敗しました');
    } finally {
      setApplying(false);
    }
  };

  // 閉じる時、未確定なら abandoned で記録
  const handleClose = async () => {
    if (consultationId) {
      try {
        await fetch('/api/consultations/ask', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            consultationId,
            resolution: 'abandoned',
          }),
        });
      } catch {
        // 失敗しても閉じる
      }
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const kamokuName = (key?: string) => {
    if (!key) return '未設定';
    const k = (KAMOKU as any)[key];
    return k ? k.name : key;
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />
      <div
        className="relative bg-white w-full sm:max-w-xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col sm:rounded-2xl"
        style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.12)' }}
      >
        {/* ヘッダー */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10 sm:rounded-t-2xl">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#1a1a1a]" />
            <p className="text-sm font-medium text-[#1a1a1a]">AIに相談</p>
          </div>
          <button onClick={handleClose} className="p-1 rounded-lg hover:bg-black/5">
            <X className="w-4 h-4 text-[#999]" />
          </button>
        </div>

        {/* 文脈サマリー */}
        <div className="px-5 py-3 bg-[#FAF9F6] border-b border-gray-100 text-[11px] text-[#666]">
          <span className="font-medium text-[#1a1a1a]">
            {context.date || '日付未'} / ¥{(context.amount || 0).toLocaleString()} / {context.store || '支払先未'}
          </span>
          <span className="text-[#999]"> / 現在の科目: {kamokuName(context.kamoku)}</span>
        </div>

        {/* 過去の類似取引（折りたたみ） */}
        {similarStore.length > 0 && (
          <div className="border-b border-gray-100">
            <button
              onClick={() => setSimilarOpen(!similarOpen)}
              className="w-full px-5 py-2.5 flex items-center justify-between text-[11px] text-[#666] hover:bg-black/5"
            >
              <span>過去の同じ支払先の処理（{similarStore.length}件）</span>
              {similarOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {similarOpen && (
              <div className="px-5 pb-3 space-y-1.5">
                {similarStore.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleApplySimilar(s)}
                    disabled={applying}
                    className="w-full text-left p-2 rounded-lg bg-white border border-gray-200 hover:border-[#1a1a1a] transition-colors disabled:opacity-50"
                  >
                    <div className="flex justify-between items-center text-[11px]">
                      <div>
                        <span className="text-[#1a1a1a] font-medium">{kamokuName(s.kamoku)}</span>
                        {s.item_description && <span className="text-[#999] ml-2">{s.item_description}</span>}
                      </div>
                      <span className="text-[#666]">{s.date} ¥{s.amount.toLocaleString()}</span>
                    </div>
                    <div className="text-[9px] text-[#3B7DA8] mt-0.5">タップでこの科目を適用</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* チャット領域 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-[#FCFBF8]">
          {messages.length === 0 && !loading && (
            <div className="text-center text-[11px] text-[#999] py-8">
              <MessageCircle className="w-6 h-6 mx-auto mb-2 text-[#ccc]" />
              AIが状況を確認中...
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] px-3 py-2 rounded-2xl text-[12px] leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-[#1a1a1a] text-white rounded-br-sm'
                    : 'bg-white text-[#1a1a1a] border border-gray-200 rounded-bl-sm'
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="px-3 py-2 rounded-2xl bg-white border border-gray-200 text-[#999] text-[12px]">
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 bg-[#999] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-[#999] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-[#999] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              </div>
            </div>
          )}
          {error && (
            <div className="text-[11px] text-[#C23728] bg-[#FDF1F0] px-3 py-2 rounded-lg">
              {error}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 推奨科目アクション */}
        {suggestedKamoku && !loading && (
          <div className="px-5 py-3 bg-[#FFF8E7] border-t border-[#F5D88E]">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] text-[#1a1a1a]">
                提案: <span className="font-medium">{kamokuName(suggestedKamoku)}</span>
              </div>
              <button
                onClick={handleApplyKamoku}
                disabled={applying || suggestedKamoku === context.kamoku}
                className="px-3 py-1.5 rounded-lg bg-[#1a1a1a] text-white text-[11px] font-medium hover:bg-[#333] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {suggestedKamoku === context.kamoku ? '同じ科目です' : applying ? '適用中...' : 'この科目で確定'}
              </button>
            </div>
          </div>
        )}

        {/* 入力欄 */}
        <div className="border-t border-gray-100 p-3 bg-white sm:rounded-b-2xl">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="質問を入力..."
              rows={1}
              disabled={loading}
              className="flex-1 px-3 py-2 text-[12px] border border-gray-200 rounded-lg focus:outline-none focus:border-[#1a1a1a] resize-none disabled:bg-gray-50"
              style={{ minHeight: '36px', maxHeight: '100px' }}
            />
            <button
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
              className="p-2 rounded-lg bg-[#1a1a1a] text-white disabled:opacity-30 disabled:cursor-not-allowed"
              title="送信 (⌘+Enter)"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
