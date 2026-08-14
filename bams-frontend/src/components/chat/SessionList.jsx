import { useState } from "react";
import { Spinner } from "@radix-ui/themes";
import { formatDistanceToNowStrict } from "date-fns";
import { MessageSquarePlus, Trash2, MessagesSquare } from "lucide-react";
import CustomButton from "../ui/CustomButton";
import DialogPopup from "../ui/DialogPopup";

const SessionList = ({
  sessions,
  selectedSessionId,
  onSelect,
  onNew,
  onDelete,
  loading,
  error,
  creating,
  onClose,
}) => {
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const pendingSession = sessions.find((s) => s.id === pendingDeleteId);

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId) return;
    setDeleting(true);
    try {
      await onDelete(pendingDeleteId);
      setPendingDeleteId(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex h-full w-64 shrink-0 flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <CustomButton
        className="w-full! justify-center! h-9!"
        onClick={onNew}
        disabled={creating}
      >
        {creating ? (
          <span className="flex items-center gap-2">
            <Spinner size="1" /> Starting...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <MessageSquarePlus className="h-4 w-4" /> New chat
          </span>
        )}
      </CustomButton>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto border-t pt-4">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Spinner size="2" />
          </div>
        )}

        {!loading && error && (
          <p className="px-2 py-4 text-center text-xs font-semibold text-red-600">{error}</p>
        )}

        {!loading && !error && sessions.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <MessagesSquare className="h-8 w-8 text-gray-300" />
            <p className="text-xs font-medium text-gray-400">No conversations yet</p>
          </div>
        )}

        {!loading &&
          !error &&
          sessions.map((session) => {
            const isActive = session.id === selectedSessionId;
            return (
              <button
                key={session.id}
                type="button"
                onClick={() => {
                  onSelect(session.id);
                  onClose?.();
                }}
                className={`group flex w-full items-center justify-between gap-1 rounded-lg px-2.5 py-2 text-left transition-colors ${
                  isActive ? "bg-blue-600/90 text-white" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">
                    {session.title || "New conversation"}
                  </p>
                  {session.last_message_at && (
                    <p className={`text-[11px] ${isActive ? "text-blue-100" : "text-gray-400"}`}>
                      {formatDistanceToNowStrict(new Date(session.last_message_at), { addSuffix: true })}
                    </p>
                  )}
                </div>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    setPendingDeleteId(session.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.stopPropagation();
                      setPendingDeleteId(session.id);
                    }
                  }}
                  className={`shrink-0 rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100 ${
                    isActive ? "hover:bg-blue-700/60" : "hover:bg-gray-200"
                  }`}
                >
                  <Trash2 className={`h-3.5 w-3.5 ${isActive ? "text-white" : "text-gray-400"}`} />
                </span>
              </button>
            );
          })}
      </div>

      <DialogPopup
        open={Boolean(pendingDeleteId)}
        setOpen={(open) => !open && setPendingDeleteId(null)}
        heading="Delete conversation?"
        subheading={`"${pendingSession?.title || "New conversation"}" and all of its messages will be permanently deleted.`}
        showButtons
        successbtntxt="Delete"
        onConfirm={handleConfirmDelete}
        isConfirming={deleting}
      />
    </div>
  );
};

export default SessionList;
