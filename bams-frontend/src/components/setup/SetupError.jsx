import { Button, Callout, Text } from "@radix-ui/themes";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Logout } from "../Logout";
import { SetupHeader } from "./SetupHeader";

export function SetupError({ setupError, retrySetup }) {
  return (
    <div className="flex flex-col gap-6">
      <SetupHeader
        icon={AlertCircle}
        title="Setup could not be completed"
        subtitle="Something went wrong while creating your workspace or syncing alert data."
        badge="Action needed"
        badgeColor="red"
      />

      <Callout.Root color="red" variant="soft">
        <Callout.Icon>
          <AlertCircle size={18} />
        </Callout.Icon>
        <Callout.Text>
          Please review the error below and try again.
        </Callout.Text>
      </Callout.Root>

      {setupError && (
        <div className="max-h-40 overflow-auto rounded-2xl border border-red-100 bg-red-50 p-4">
          <Text
            as="p"
            size="1"
            className="whitespace-pre-wrap break-words font-mono leading-5 text-red-700"
          >
            {setupError}
          </Text>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row ml-auto">
        <Button
          size="3"
          radius="large"
          className="flex-1 cursor-pointer !bg-blue-600 !font-bold !text-white shadow-sm hover:!bg-blue-700"
          onClick={retrySetup}
        >
          <RotateCcw size={16} />
          Retry setup
        </Button>

        <Logout className="!text-sm sm:w-36" />
      </div>
    </div>
  );
}