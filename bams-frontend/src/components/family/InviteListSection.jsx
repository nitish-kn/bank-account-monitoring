import { Badge, Button, Spinner } from "@radix-ui/themes";
import { Check, X } from "lucide-react";

const formatDate = (value) => {
  if (!value) return "";

  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const statusColor = (status) => {
  if (status === "accepted") return "green";
  if (status === "declined") return "red";
  return "amber";
};

const InviteListSection = ({
  title,
  icon,
  invites = [],
  loading = false,
  emptyMessage,
  type = "pending",
  actionLoadingId,
  onAccept,
  onDecline,
}) => {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-bold text-gray-800">
          {icon}
          {title}
        </p>
        <Badge color={type === "pending" ? "blue" : "gray"} variant="soft" radius="full">
          {invites.length}
        </Badge>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-md border border-gray-100 p-3 text-sm text-gray-500">
          <Spinner size="1" />
          Loading invites...
        </div>
      ) : invites.length === 0 ? (
        <div className="rounded-md border border-gray-100 p-3 text-sm font-medium text-gray-400">
          {emptyMessage}
        </div>
      ) : (
        <div className={type === "sent" ? "max-h-36 space-y-2 overflow-y-auto pr-1" : "space-y-2"}>
          {invites.map((invite) => (
            <div
              key={invite.id}
              className="rounded-md border border-gray-100 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-800">
                    {type === "pending"
                      ? `${invite.invited_by?.name || invite.invited_by?.email || "Someone"} invited you`
                      : invite.invited_email}
                  </p>
                  <p className="mt-1 text-xs font-medium text-gray-400">
                    {type === "pending"
                      ? `${invite.family?.name || "Family"}${invite.created_at ? ` on ${formatDate(invite.created_at)}` : ""}`
                      : invite.created_at ? `Sent ${formatDate(invite.created_at)}` : "Invite sent"}
                  </p>
                </div>

                {type === "pending" ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      size="1"
                      color="green"
                      disabled={actionLoadingId === invite.id}
                      onClick={() => onAccept?.(invite.id)}
                    >
                      {actionLoadingId === invite.id ? <Spinner size="1" /> : <Check className="h-3.5 w-3.5" />}
                      Accept
                    </Button>
                    <Button
                      size="1"
                      color="red"
                      variant="soft"
                      disabled={actionLoadingId === invite.id}
                      onClick={() => onDecline?.(invite.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                      Decline
                    </Button>
                  </div>
                ) : (
                  <Badge
                    color={statusColor(invite.status)}
                    variant="soft"
                    radius="full"
                    className="capitalize"
                  >
                    {invite.status}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default InviteListSection;
