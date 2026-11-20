import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Bot, Sparkles } from 'lucide-react';
import api from '../api/client';
import { ChatMessage } from '../types';

const SUGGESTED_PROMPTS = [
  "What assets should I add?",
  "How does key-share work?",
  "How does the claim process work?",
  "What is a grace period?",
];

const AICopilot: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: 'Hi! I\'m your HeirFlow AI Copilot 👋. I can help you plan your digital estate, understand key-share security, and guide you through the platform. What would you like to know?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const sendMessage = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput('');
    const newMessages = [...messages, { role: 'user' as const, content: msg }];
    setMessages(newMessages);
    setLoading(true);
    try {
      const res = await api.post('/gemini/chat', {
        message: msg,
        context: 'estate_planning',
      });
      const reply = res.data?.data?.reply || res.data?.reply || 'I\'m here to help with your estate planning questions!';
      setMessages([...newMessages, { role: 'assistant', content: reply }]);
    } catch {
      setMessages([...newMessages, {
        role: 'assistant',
        content: 'I\'m having trouble connecting right now. Please ensure your backend is running. In the meantime, feel free to explore the dashboard!'
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className={`fixed bottom-6 right-6 w-12 h-12 bg-zinc-100 hover:bg-white text-zinc-950 rounded-full flex items-center justify-center shadow-lg shadow-black/40 border border-zinc-300 transition-transform hover:scale-105 z-40 ${open ? 'hidden' : 'flex'}`}
        title="HeirFlow Copilot"
      >
        <MessageSquare className="w-5 h-5" />
        <span className="absolute top-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#09090B]" />
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 w-96 h-[540px] bg-[#111114] border border-zinc-800 rounded-2xl shadow-2xl shadow-black/60 flex flex-col z-40 overflow-hidden">
          {/* Header */}
          <div className="bg-[#0C0C0F] border-b border-zinc-800 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-zinc-800 border border-zinc-700 rounded-lg flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-zinc-200" />
              </div>
              <div>
                <p className="font-semibold text-zinc-100 text-sm">HeirFlow Copilot</p>
                <p className="text-xs text-zinc-500">Estate Planning Advisor</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-zinc-400 hover:text-zinc-100">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 bg-zinc-800 border border-zinc-700 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5 text-zinc-300" />
                  </div>
                )}
                <div className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-zinc-100 text-zinc-950'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-200'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-2">
                <div className="w-7 h-7 bg-zinc-800 border border-zinc-700 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Bot className="w-3.5 h-3.5 text-zinc-300" />
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-1">
                  {[0, 1, 2].map(i => (
                    <span key={i} className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggested prompts */}
          {messages.length <= 1 && (
            <div className="px-4 pb-2">
              <p className="text-xs text-slate-500 mb-2">Suggested questions:</p>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_PROMPTS.map(p => (
                  <button
                    key={p}
                    onClick={() => sendMessage(p)}
                    className="text-xs bg-slate-700 hover:bg-indigo-700 text-slate-300 hover:text-white px-3 py-1.5 rounded-full transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-slate-700">
            <div className="flex items-center gap-2 bg-slate-900 rounded-xl px-3 py-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your estate..."
                className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 outline-none"
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                className="w-8 h-8 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg flex items-center justify-center transition-colors flex-shrink-0"
              >
                <Send className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AICopilot;

