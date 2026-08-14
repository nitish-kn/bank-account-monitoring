import { useEffect, useRef } from "react";
import { Spinner } from "@radix-ui/themes";
import { Bot, Landmark, PiggyBank, TrendingDown, CreditCard } from "lucide-react";
import MessageBubble from "./MessageBubble";

const SUGGESTIONS = [
  { text: "List all my bank accounts.", icon: Landmark },
  { text: "How much did I spend this month?", icon: PiggyBank },
  { text: "Which account had the biggest balance drop this year?", icon: TrendingDown },
  { text: "What's my card balance?", icon: CreditCard },
];

const TypingIndicator = () => (
  <div className="flex items-start gap-2.5">
    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
      <Bot className="h-4 w-4" />
    </div>
    <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm border border-gray-200 bg-white px-4 py-3 shadow-sm">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
  </div>
);

const MessageThread = ({ messages, loading, error, sending, onRetry, onSuggestion }) => {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, sending]);

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-gray-500">
        <Spinner size="3" />
        <p className="text-sm font-medium">Loading conversation...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="rounded-xl border border-red-100 bg-red-50 p-6 text-sm font-semibold text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-6 text-center overflow-y-auto">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600/10 text-blue-700">
          <Bot className="h-7 w-7" />
        </div>
        <div>
          <p className="text-base font-semibold text-gray-700">Ask me about your accounts</p>
          <p className="mt-1 max-w-sm text-sm font-medium text-gray-400">
            Balances, deltas, recent transactions, spending trends — grounded in your real data.
          </p>
        </div>
        <div className="grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
          {SUGGESTIONS.map(({ text, icon: Icon }) => (
            <button
              key={text}
              type="button"
              onClick={() => onSuggestion(text)}
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left text-xs font-medium text-gray-600 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-700"
            >
              <Icon className="h-4 w-4 shrink-0 text-blue-500" />
              {text}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-2">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} onRetry={onRetry} />
      ))}
      {sending && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
};

export default MessageThread;
