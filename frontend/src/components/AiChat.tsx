import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Loader2, MessageCircle, Send, Sparkles, X } from 'lucide-react';
import { type AiChatMessage } from '../services/api';

const brandPurple = 'rgb(165, 44, 240)';

type ChatEntry = AiChatMessage & { toolsUsed?: string[] };

type AiChatProps = {
  title: string;
  buttonLabel: string;
  greeting: string;
  suggestions: string[];
  sendMessage: (messages: AiChatMessage[]) => Promise<{ data: { reply: string; tools_used: string[] } }>;
};

function getAiErrorMessage(err: unknown) {
  if (axios.isAxiosError(err)) {
    if (err.response?.status === 503) return 'IA não configurada.';
    const detail = (err.response?.data as { detail?: string } | undefined)?.detail;
    if (detail) return detail;
  }
  return 'Não consegui responder agora. Tente novamente.';
}

export default function AiChat({ title, buttonLabel, greeting, suggestions, sendMessage }: AiChatProps) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries, loading]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || loading) return;

    const next: ChatEntry[] = [...entries, { role: 'user', content }];
    setEntries(next);
    setInput('');
    setError('');
    setLoading(true);
    try {
      const history = next.slice(-20);
      while (history.length > 0 && history[0].role !== 'user') history.shift();
      const res = await sendMessage(
        history.map(({ role, content: message }) => ({ role, content: message.slice(0, 1000) })),
      );
      setEntries([...next, { role: 'assistant', content: res.data.reply, toolsUsed: res.data.tools_used }]);
    } catch (err) {
      setError(getAiErrorMessage(err));
      setEntries(entries);
      setInput(content);
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white shadow-lg hover:opacity-90"
        style={{ background: brandPurple }}
      >
        <MessageCircle className="h-5 w-5" />
        {buttonLabel}
      </button>
    );
  }

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 flex max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[380px]">
      <div className="flex items-center justify-between px-4 py-3 text-white" style={{ background: brandPurple }}>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          <span className="text-sm font-semibold">{title}</span>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="opacity-80 hover:opacity-100">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {entries.length === 0 && (
          <div>
            <p className="text-sm text-gray-600">
              {greeting}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void send(suggestion)}
                  className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {entries.map((entry, index) => (
          <div key={index} className={entry.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className="max-w-[85%]">
              <div
                className={`whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm leading-6 ${
                  entry.role === 'user' ? 'text-white' : 'bg-gray-100 text-gray-800'
                }`}
                style={entry.role === 'user' ? { background: brandPurple } : undefined}
              >
                {entry.content}
              </div>
              {entry.toolsUsed && entry.toolsUsed.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {entry.toolsUsed.map((tool) => (
                    <span key={tool} className="rounded-full bg-purple/5 px-2 py-0.5 font-mono text-[10px] text-gray-500">
                      {tool}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Pensando...
          </div>
        )}
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="flex gap-2 border-t border-gray-100 p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={1000}
          placeholder="Digite sua dúvida..."
          className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="inline-flex items-center justify-center rounded-xl px-3 text-white disabled:opacity-50"
          style={{ background: brandPurple }}
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
