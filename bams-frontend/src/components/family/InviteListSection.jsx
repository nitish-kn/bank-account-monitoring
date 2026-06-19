import { Badge, Button, Spinner } from "@radix-ui/themes";
import { Check, TriangleAlert, X } from "lucide-react";

const FAMILY_INVITE = "family_invite";
const JOIN_REQUEST = "join_request";

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
          {invites.map((invite) => {
            const inviteType = invite.invite_type || FAMILY_INVITE;
            const isJoinRequest = inviteType === JOIN_REQUEST;
            const inviterName = invite.invited_by?.name || invite.invited_by?.email || "Someone";
            const receiverName = invite.invited_user?.name || invite.invited_email || "this account";
            const familyName = invite.family?.name || "this family";
            const createdDate = invite.created_at ? formatDate(invite.created_at) : "";

            const titleText = type === "pending"
              ? isJoinRequest
                ? `${inviterName} wants to join your family`
                : `${inviterName} invited you`
              : isJoinRequest
                ? `Request to join ${receiverName}'s family`
                : invite.invited_email;

            const detailText = type === "pending"
              ? isJoinRequest
                ? `${inviterName} will be added to ${familyName}${createdDate ? ` - ${createdDate}` : ""}`
                : `${familyName}${createdDate ? ` - ${createdDate}` : ""}`
              : createdDate
                ? `Sent ${createdDate}`
                : "Invite sent";

            const warningText = invite.requires_family_change
              ? isJoinRequest
                ? type === "pending"
                  ? `${inviterName} is already in another family. Approving will move them into ${familyName}.`
                  : `If approved, you will move into ${familyName}.`
                : type === "pending"
                  ? `You are already in another family. Accepting will move you into ${familyName}.`
                  : `${receiverName} is already in another family. If they accept, they will move into ${familyName}.`
              : "";

            return (
              <div
                key={invite.id}
                className="rounded-md border border-gray-100 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-800">
                      {titleText}
                    </p>
                    <p className="mt-1 text-xs font-medium text-gray-400">
                      {detailText}
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
                        {isJoinRequest ? "Approve" : "Accept"}
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

                {warningText && (
                  <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{warningText}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default InviteListSection;
