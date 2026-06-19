import { Button, Text } from "@radix-ui/themes";
import { CheckCircle2, FileSpreadsheet, MailCheck } from "lucide-react";
import { Logout } from "../Logout";
import { SetupHeader } from "./SetupHeader";
import { SetupMetric } from "./SetupMetric";

export function SetupSuccess({ onClose }) {
  return (
    <div className="flex flex-col gap-6">
      <SetupHeader
        icon={CheckCircle2}
        title="Workspace setup complete"
        subtitle="Your integration is active. FloData is syncing your last 30 days of emails in the background."
        badge="Ready"
        badgeColor="green"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SetupMetric
          icon={MailCheck}
          label="30-day sync"
          value="Running"
          tone="green"
        />

        <SetupMetric
          icon={FileSpreadsheet}
          label="Google Sheet"
          value="Ready"
          tone="blue"
        />
      </div>

      <div className="rounded-2xl border border-green-100 bg-green-50 p-5">
        <Text size="2" weight="bold" className="text-green-800">
          Sync is active
        </Text>

        <Text as="p" size="1" className="mt-1 leading-6 text-green-700">
          You can go to the dashboard now. New data will appear gradually while
          the background sync continues.
        </Text>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row ml-auto">
        <Button
          size="3"
          radius="large"
          className="flex-1 cursor-pointer !bg-blue-600 !font-bold !text-white shadow-sm hover:!bg-blue-700"
          onClick={onClose}
        >
          Go to Dashboard
        </Button>

        <Logout className="!text-sm sm:w-36" />
      </div>
    </div>
  );
}
