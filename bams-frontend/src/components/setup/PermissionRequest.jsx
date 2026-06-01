import { Callout, Spinner, Text } from "@radix-ui/themes";
import { AlertCircle, FileSpreadsheet, Mail, ShieldCheck } from "lucide-react";
import { Logout } from "../Logout";
import CustomButton from "../ui/CustomButton";
import { getButtonText } from "../../lib/helper";
import { SetupHeader } from "./SetupHeader";
import { PermissionItem } from "./PermissionItem";

export function PermissionRequest({
  user,
  permissionsMissing,
  needsEmail,
  needsSheets,
  loading,
  error,
  requestMissingPermissions,
}) {
  const buttonText = getButtonText(permissionsMissing, needsEmail, needsSheets);

  return (
    <div className="flex flex-col gap-4">
      <SetupHeader
        icon={ShieldCheck}
        title={
          <>
            Welcome to FloData,{" "}
            <span className="text-blue-600">{user?.name || "User"}</span>
          </>
        }
        subtitle="Connect your Google workspace to start syncing alerts, creating sheets, and powering your dashboard automation."
      />

      {error && (
        <Callout.Root color="red" variant="soft">
          <Callout.Icon>
            <AlertCircle size={18} />
          </Callout.Icon>
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}

      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:p-5">
        <div className="flex flex-col gap-1">
          <Text
            size="2"
            weight="bold"
            className="uppercase tracking-wide text-blue-700"
          >
            Authorization required
          </Text>

          <Text size="1" color="gray" className="leading-6">
            FloData needs the following permissions to read relevant emails and
            create or update your Google Sheets dashboard.
          </Text>
        </div>

        <div className="mt-5 flex flex-col gap-3">
          <PermissionItem
            required={needsEmail}
            icon={Mail}
            title="Gmail Access"
            description="Read relevant alert emails so they can be parsed and synced into your dashboard."
          />

          <PermissionItem
            required={needsSheets}
            icon={FileSpreadsheet}
            title="Google Drive & Sheets Access"
            description="Create dashboard sheets, append parsed rows, and keep your synced alert inbox updated."
          />
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
        <Text size="1" color="gray" className="leading-5">
          Your permissions are used only for this automation workflow. You can
          revoke access anytime from your Google Account settings.
        </Text>
      </div>

      <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-end">
        <CustomButton
          size="3"
          radius="large"
          className="flex-1 cursor-pointer !text-sm"
          onClick={requestMissingPermissions}
          disabled={loading}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Spinner size="1" />
              Authenticating with Google...
            </span>
          ) : (
            buttonText
          )}
        </CustomButton>

        <Logout className="w-full sm:w-36 !text-sm" />
      </div>
    </div>
  );
}
