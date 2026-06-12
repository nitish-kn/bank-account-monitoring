import { Badge, Spinner, Text } from "@radix-ui/themes";
import { CheckCircle2, Loader2, Settings } from "lucide-react";
import { SetupHeader } from "./SetupHeader";

export function SetupProgress({ message, stepHistory = [] }) {
  const progress = Math.min(20 + stepHistory.length * 18, 94);

  return (
    <div className="flex flex-col gap-6">
      <SetupHeader
        icon={Settings}
        title="Setting up your workspace"
        subtitle="Creating your spreadsheet, configuring Google Sheets, and syncing your latest alert emails."
        badge="In progress"
      />

      {/* Active step */}
      <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm ring-1 ring-blue-100">
            <Loader2 size={24} className="animate-spin" />
          </div>

          <div className="min-w-0 flex-1">
            <Text
              size="1"
              weight="bold"
              className="uppercase tracking-wide text-blue-500"
            >
              Now running
            </Text>

            <Text
              as="p"
              size="4"
              weight="bold"
              className="mt-1 break-words leading-6 text-blue-950"
            >
              {message || "Initializing Google integrations..."}
            </Text>

            <Text as="p" size="1" color="gray" className="mt-1">
              Please keep this window open while setup continues.
            </Text>
          </div>
        </div>

        <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-blue-100">
          <div
            className="h-full rounded-full bg-blue-600 transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Activity log */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <Text size="4" weight="bold" className="text-gray-950">
              Setup activity
            </Text>
            <Text as="p" size="1" color="gray" className="mt-1">
              Completed setup steps will appear here.
            </Text>
          </div>

          <Badge color="gray" variant="soft" radius="full">
            {stepHistory.length} {stepHistory.length === 1 ? "step" : "steps"}
          </Badge>
        </div>

        {stepHistory.length > 0 ? (
          <div className="max-h-56 space-y-3 overflow-y-auto pr-1">
            {stepHistory.map((item, idx) => (
              <div
                key={`${item.message}-${idx}`}
                className="animate-slide-fade-in flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3"
              >
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-50 text-green-600 ring-1 ring-green-100">
                  <CheckCircle2 size={16} />
                </div>

                <div className="min-w-0 flex-1">
                  <Text
                    size="2"
                    weight="medium"
                    className="break-words text-gray-800"
                  >
                    {item.message}
                  </Text>

                  <Text as="p" size="1" color="gray" className="mt-0.5">
                    Completed
                  </Text>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-gray-50 py-8 text-center">
            <Spinner size="2" />
            <Text size="2" color="gray">
              Starting setup...
            </Text>
          </div>
        )}
      </div>
    </div>
  );
}