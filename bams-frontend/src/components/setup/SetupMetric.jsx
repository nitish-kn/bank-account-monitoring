import { Text } from "@radix-ui/themes";

export function SetupMetric({ icon: Icon, label, value, tone = "blue" }) {
  const toneClass = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            toneClass[tone] || toneClass.blue
          }`}
        >
          <Icon size={20} />
        </div>

        <div>
          <Text size="1" color="gray" weight="medium">
            {label}
          </Text>

          <Text as="p" size="5" weight="bold" className="text-gray-950">
            {value}
          </Text>
        </div>
      </div>
    </div>
  );
}