import ReactMarkdown from "react-markdown";
import { Bot, RefreshCw } from "lucide-react";
import { useAuthStore } from "../../store/authStore";

const formatToolName = (name = "") =>
  name
    .split("_")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");

const MessageBubble = ({ message, onRetry }) => {
  const org = useAuthStore((state) => state.org);
  const isUser = message.role === "user";
  const isFailed = message.status === "failed";
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];

  if (isUser) {
    return (
      <div className="flex items-start justify-end gap-2.5">
        <div className="flex max-w-[75%] flex-col items-end gap-1">
          <div
            className={`rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm font-medium text-white shadow-sm ${
              isFailed ? "bg-red-500" : "bg-blue-600"
            } ${message.status === "sending" ? "opacity-70" : ""}`}
          >
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
          {isFailed && (
            <button
              type="button"
              onClick={() => onRetry?.(message)}
              className="flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700"
            >
              <RefreshCw className="h-3 w-3" /> Failed to send &middot; tap to retry
            </button>
          )}
        </div>
        <img
          src={org?.picture}
          alt=""
          className="mt-0.5 h-7 w-7 shrink-0 rounded-full object-cover"
        />
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
        <Bot className="h-4 w-4" />
      </div>
      <div className="flex max-w-[75%] flex-col items-start gap-1.5">
        <div className="rounded-2xl rounded-tl-sm border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 shadow-sm">
          <div className="chat-markdown">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        </div>
        {toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1">
            {toolCalls.map((call, idx) => (
              <span
                key={`${call.tool_name}-${idx}`}
                className="rounded-full bg-gray-100 px-2 py-0.5 text-[10.5px] font-medium text-gray-500"
                title={call.cached ? "Served from cache" : "Queried live"}
              >
                {formatToolName(call.tool_name)}
                {call.cached ? " · cached" : ""}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;
