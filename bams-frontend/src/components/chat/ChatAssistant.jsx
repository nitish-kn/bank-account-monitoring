import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { MessagesSquare } from "lucide-react";
import { chatApi } from "../../api/chat";
import SessionList from "./SessionList";
import MessageThread from "./MessageThread";
import ChatComposer from "./ChatComposer";

const errorMessage = (err, fallback) => err.response?.data?.detail || err.message || fallback;

const ChatAssistant = () => {
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState("");

  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState("");

  const [composerValue, setComposerValue] = useState("");
  const [sending, setSending] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  const [showChatsDrawer, setShowChatsDrawer] = useState(false);

  const hasInitialized = useRef(false);

  const fetchSessions = useCallback(async ({ selectFirst = false } = {}) => {
    setSessionsLoading(true);
    setSessionsError("");
    try {
      const result = await chatApi.listSessions();
      const list = result.sessions || [];
      setSessions(list);
      if (selectFirst && list.length > 0) {
        setSelectedSessionId(list[0].id);
      }
    } catch (err) {
      setSessionsError(errorMessage(err, "Failed to load conversations."));
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    fetchSessions({ selectFirst: true });
  }, [fetchSessions]);

  useEffect(() => {
    if (!selectedSessionId) {
      setMessages([]);
      return;
    }

    let isCancelled = false;
    const fetchMessages = async () => {
      setMessagesLoading(true);
      setMessagesError("");
      try {
        const result = await chatApi.getMessages(selectedSessionId);
        if (!isCancelled) setMessages(result.messages || []);
      } catch (err) {
        if (!isCancelled) setMessagesError(errorMessage(err, "Failed to load this conversation."));
      } finally {
        if (!isCancelled) setMessagesLoading(false);
      }
    };

    fetchMessages();
    return () => {
      isCancelled = true;
    };
  }, [selectedSessionId]);

  const handleNewChat = async () => {
    setCreatingSession(true);
    try {
      const session = await chatApi.createSession();
      setSessions((prev) => [session, ...prev]);
      setSelectedSessionId(session.id);
      setMessages([]);
      setShowChatsDrawer(false);
    } catch (err) {
      toast.error(errorMessage(err, "Failed to start a new conversation."));
    } finally {
      setCreatingSession(false);
    }
  };

  const handleDeleteSession = async (sessionId) => {
    try {
      await chatApi.deleteSession(sessionId);
      setSessions((prev) => {
        const remaining = prev.filter((s) => s.id !== sessionId);
        if (sessionId === selectedSessionId) {
          setSelectedSessionId(remaining[0]?.id || null);
        }
        return remaining;
      });
    } catch (err) {
      toast.error(errorMessage(err, "Failed to delete conversation."));
    }
  };

  const sendMessage = async (text) => {
    const optimisticId = `local-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: optimisticId, role: "user", content: text, status: "sending" },
    ]);
    setSending(true);

    try {
      let sessionId = selectedSessionId;

      if (!sessionId) {
        const session = await chatApi.createSession();
        sessionId = session.id;
        setSessions((prev) => [session, ...prev]);
        setSelectedSessionId(sessionId);
      }

      const result = await chatApi.sendMessage(sessionId, text);

      setMessages((prev) => [
        ...prev.map((m) => (m.id === optimisticId ? { ...m, status: "sent" } : m)),
        result.message,
      ]);

      setSessions((prev) =>
        prev
          .map((s) =>
            s.id === sessionId
              ? { ...s, title: result.session.title, last_message_at: result.session.last_message_at }
              : s,
          )
          .sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0)),
      );
    } catch (err) {
      setMessages((prev) => prev.map((m) => (m.id === optimisticId ? { ...m, status: "failed" } : m)));
      toast.error(errorMessage(err, "Failed to send message."));
    } finally {
      setSending(false);
    }
  };

  const handleSend = (text) => {
    if (!text.trim() || sending) return;
    setComposerValue("");
    sendMessage(text.trim());
  };

  const handleRetry = (message) => {
    setMessages((prev) => prev.filter((m) => m.id !== message.id));
    sendMessage(message.content);
  };

  const activeSession = sessions.find((s) => s.id === selectedSessionId);

  return (
    <div className="flex h-full gap-3.5">
      <div className="hidden md:flex md:h-full">
        <SessionList
          sessions={sessions}
          selectedSessionId={selectedSessionId}
          onSelect={setSelectedSessionId}
          onNew={handleNewChat}
          onDelete={handleDeleteSession}
          loading={sessionsLoading}
          error={sessionsError}
          creating={creatingSession}
        />
      </div>

      {showChatsDrawer && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setShowChatsDrawer(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 h-full p-3 md:hidden">
            <SessionList
              sessions={sessions}
              selectedSessionId={selectedSessionId}
              onSelect={setSelectedSessionId}
              onNew={handleNewChat}
              onDelete={handleDeleteSession}
              loading={sessionsLoading}
              error={sessionsError}
              creating={creatingSession}
              onClose={() => setShowChatsDrawer(false)}
            />
          </div>
        </>
      )}

      <div className="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
        <div className="flex items-center gap-2 border-b border-gray-100 pb-3 md:hidden">
          <button
            type="button"
            onClick={() => setShowChatsDrawer(true)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-600"
          >
            <MessagesSquare className="h-3.5 w-3.5" /> Chats
          </button>
          <p className="truncate text-sm font-semibold text-gray-700">
            {activeSession?.title || "New conversation"}
          </p>
        </div>

        <MessageThread
          messages={messages}
          loading={messagesLoading}
          error={messagesError}
          sending={sending}
          onRetry={handleRetry}
          onSuggestion={handleSend}
        />

        <ChatComposer value={composerValue} onChange={setComposerValue} onSend={handleSend} disabled={sending} />
      </div>
    </div>
  );
};

export default ChatAssistant;
