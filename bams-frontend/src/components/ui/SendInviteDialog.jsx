import React, { useState } from "react";
import DialogPopup from "./DialogPopup";
import TagInput from "./TagInput";
import { isValidEmail } from "../../lib/helper";
import { CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { createInvites } from "../../lib/inviteApi";

const SendInviteDialog = ({ isSendInviteDialogOpen, setIsSendInviteDialogOpen, onInvitesChanged }) => {
  const [tags, setTags] = useState([]);
  const [tagError, setTagError] = useState("");
  const [inviteResult, setInviteResult] = useState(null);
  const [submitError, setSubmitError] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);

  const warningLabels = {
    users_not_found: "Ask these users to login first",
    self_invites: "You cannot invite yourself",
    already_family_members: "Already in your family",
    already_in_another_family: "Already part of another family",
    already_pending: "Already invited",
  };

  const visibleWarnings = Object.entries(inviteResult?.warnings || {}).filter(
    ([, emails]) => emails?.length > 0,
  );

  const handleSendInvites = async () => {
    if (tags.length === 0) {
      setTagError("Add at least one email address");
      return;
    }

    setSubmitError("");
    setInviteResult(null);
    setSendingInvite(true);

    try {
      const result = await createInvites(tags);
      setInviteResult(result);
      if (result?.invites?.length > 0) {
        setTags([]);
      }
      onInvitesChanged?.();
    } catch (error) {
      setSubmitError(error.response?.data?.detail || error.message || "Failed to send invites");
    } finally {
      setSendingInvite(false);
    }
  };

  return (
    <DialogPopup
      showButtons={true}
      open={isSendInviteDialogOpen}
      setOpen={setIsSendInviteDialogOpen}
      successbtntxt="Send Invites"
      heading="Invite People"
      subheading="Enter the email addresses of the people you want to invite to view their data."
      onConfirm={handleSendInvites}
      confirmDisabled={tags.length === 0}
      isConfirming={sendingInvite}
    >
      {/* Display the error string passed up from TagInput */}
      {tagError && (
        <p className="flex items-center gap-1 mb-2 text-xs text-red-500 font-medium">
          <Info className="w-4 h-4" /> {tagError}
        </p>
      )}

      {submitError && (
        <p className="flex items-center gap-1 mb-2 text-xs text-red-500 font-medium">
          <TriangleAlert className="w-4 h-4" /> {submitError}
        </p>
      )}

      <TagInput
        placeholder="Enter email addresses..."
        tags={tags}
        onTagsChange={setTags}
        validator={isValidEmail}
        error={tagError}
        setError={setTagError}
      />

      <p className="mt-2 text-gray-400 px-1 text-xs"> Type an email address and press <span className="font-bold text-gray-500"> Enter </span> </p>

      {inviteResult && (
        <div className="mt-4 space-y-3">
          {inviteResult?.invites?.length > 0 && (
            <div className="rounded-md border border-green-100 bg-green-50 p-3">
              <p className="flex items-center gap-2 text-xs font-semibold text-green-700">
                <CheckCircle2 className="h-4 w-4" />
                Sent {inviteResult.invites.length} invite{inviteResult.invites.length === 1 ? "" : "s"}.
              </p>
            </div>
          )}

          {visibleWarnings.length > 0 && (
            <div className="rounded-md border border-amber-100 bg-amber-50 p-3">
              <p className="flex items-center gap-2 text-xs font-semibold text-amber-700">
                <TriangleAlert className="h-4 w-4" />
                Some emails need attention
              </p>

              <div className="mt-2 space-y-2">
                {visibleWarnings.map(([key, emails]) => (
                  <div key={key}>
                    <p className="text-xs font-semibold text-amber-800">
                      {warningLabels[key] || key}
                    </p>
                    <p className="text-xs text-amber-700 break-words">
                      {emails.join(", ")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </DialogPopup>
  );
};

export default SendInviteDialog;
