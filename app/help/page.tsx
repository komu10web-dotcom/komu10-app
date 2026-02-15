'use client';

import { useState, useEffect, useRef } from 'react';
import Header from '@/components/Header';
import { COLORS } from '@/lib/constants';

// よくある質問
const FAQ = [
  { q: '撮影旅行の食事は経費？', a: '取材目的の食事は「接待交際費」として計上可能。私的な食事との区別のため取材目的を記録。' },
  { q: 'カメラの処理は？', a: '10万円未満→消耗品費。10万円以上→固定資産台帳に登録し耐用年数5年で減価償却。' },
  { q: '家賃・光熱費の按分は？', a: '作業スペースの面積割合で按分。例：60㎡中15㎡の作業部屋＝25%。按分設定画面で設定。' },
  { q: 'BGMサブスクの科目は？', a: '「新聞図書費」。Adobe CC、Artlist等のサブスクはすべてこの科目。' },
  { q: 'レンタカーの科目は？', a: '「車両費」。ロケ用レンタカー、ガソリン、駐車場代が含まれます。' },
  { q: '65万円控除の条件は？', a: '複式簿記で記帳＋E-TAXで電子申告。仕訳帳CSV出力→E-TAX転記でOK。' },
  { q: '按分の根拠記録は？', a: '按分設定の「根拠メモ」に記載。例：「作業部屋15㎡/全体60㎡=25%」。' },
  { q: 'クレカCSVインポートは？', a: '取引追加画面からカード会社のCSVをインポート。科目は手動で設定。' },
  { q: '外注費の源泉徴収は？', a: '個人への支払いは源泉徴収が必要な場合あり。税理士に確認を推奨。' },
  { q: 'YouTubeの広告収益の科目は？', a: '「売上高」で収益タイプ「広告収益（YouTube）」を選択。' },
];

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function HelpPage() {
  const [currentUser, setCurrentUser] = useState('all');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cookies = document.cookie.split(';');
    const userCookie = cookies.find(c => c.trim().startsWith('komu10_user='));
    if (userCookie) {
      const user = userCookie.split('=')[1];
      if (user === 'all' || user === 'tomo' || user === 'toshiki') setCurrentUser(user);
    }
  }, []);

  const handleUserChange = (user: string) => {
    setCurrentUser(user);
    document.cookie = `komu10_user=${user}; path=/; max-age=31536000`;
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleFAQClick = (faq: { q: string; a: string }) => {
    setMessages(prev => [
      ...prev,
      { role: 'user', content: faq.q },
      { role: 'assistant', content: faq.a },
    ]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: `あなたはkomu10会計システムのアシスタントです。日本の個人事業主（YouTuber・映像クリエイター）向けの会計・確定申告に関する質問に答えます。

主な事業：観光データサイエンス、観光事業の設計・実装、編集・体験設計、THIS PLACE（フォトストック）、YouTube

よくある科目：
- 旅費交通費：撮影地への交通費、ロケ移動、宿泊
- 消耗品費：10万円未満の備品（SDカード、三脚等）
- 通信費：携帯、WiFi、サーバー代（按分対象）
- 接待交際費：取材先でのお礼、コラボ食事
- 外注費：動画編集外注、翻訳、デザイン
- 新聞図書費：Adobe CC、BGMサブスク、参考書籍
- 車両費：ロケ用レンタカー、ガソリン
- 地代家賃：作業スペース家賃（按分対象）
- 水道光熱費：自宅作業分（按分対象）
- 減価償却費：10万円以上の機材

回答は簡潔に、日本語で答えてください。具体的な税額計算や法的アドバイスは税理士への相談を推奨してください。`,
          messages: [
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: userMessage },
          ],
        }),
      });

      const data = await response.json();
      const assistantMessage = data.content?.[0]?.text || 'すみません、回答を生成できませんでした。';
      setMessages(prev => [...prev, { role: 'assistant', content: assistantMessage }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'エラーが発生しました。もう一度お試しください。' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: COLORS.bg }}>
      <Header currentUser={currentUser} onUserChange={handleUserChange} />
      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-lg font-medium" style={{ color: COLORS.textPrimary }}>AIヘルプ・Q&A</h1>
          <p className="text-xs mt-1" style={{ color: COLORS.textMuted }}>
            会計・確定申告に関する質問をAIに聞けます。よくある質問をクリックするか、自由に質問してください。
          </p>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* 左カラム：よくある質問 */}
          <div className="space-y-4">
            <div className="text-xs font-medium" style={{ color: COLORS.textMuted }}>よくある質問</div>
            <div className="space-y-2">
              {FAQ.map((faq, i) => (
                <button
                  key={i}
                  onClick={() => handleFAQClick(faq)}
                  className="w-full text-left p-3 rounded-lg text-sm transition-colors hover:bg-white"
                  style={{ background: 'rgba(255,255,255,0.5)', color: COLORS.textPrimary }}
                >
                  {faq.q}
                </button>
              ))}
            </div>
          </div>

          {/* 右カラム：チャット */}
          <div className="col-span-2">
            <div className="card" style={{ height: '600px', display: 'flex', flexDirection: 'column' }}>
              {/* メッセージエリア */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && (
                  <div className="text-center py-12" style={{ color: COLORS.textMuted }}>
                    <div className="text-4xl mb-4">💬</div>
                    <div className="text-sm">会計に関する質問をどうぞ</div>
                    <div className="text-xs mt-2">左のよくある質問をクリックするか、下の入力欄から質問してください</div>
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] p-3 rounded-lg text-sm ${
                        msg.role === 'user' ? 'rounded-br-none' : 'rounded-bl-none'
                      }`}
                      style={{
                        background: msg.role === 'user' ? COLORS.green : 'white',
                        color: msg.role === 'user' ? 'white' : COLORS.textPrimary,
                        border: msg.role === 'assistant' ? `1px solid ${COLORS.border}` : 'none',
                      }}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div
                      className="p-3 rounded-lg rounded-bl-none text-sm"
                      style={{ background: 'white', border: `1px solid ${COLORS.border}` }}
                    >
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: COLORS.textMuted }} />
                        <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: COLORS.textMuted, animationDelay: '0.2s' }} />
                        <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: COLORS.textMuted, animationDelay: '0.4s' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* 入力エリア */}
              <form onSubmit={handleSubmit} className="p-4 border-t" style={{ borderColor: COLORS.border }}>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="input flex-1"
                    placeholder="会計に関する質問を入力..."
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    disabled={loading}
                  />
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={loading || !input.trim()}
                  >
                    送信
                  </button>
                </div>
                <div className="text-xs mt-2" style={{ color: COLORS.textMuted }}>
                  ※ 具体的な税額計算や法的判断は税理士にご相談ください
                </div>
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
