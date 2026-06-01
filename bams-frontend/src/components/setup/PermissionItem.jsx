import { Badge, Text } from "@radix-ui/themes";
import { AlertCircle, CheckCircle2 } from "lucide-react";

export const PermissionItem = ({ required, icon: Icon, title, description }) => {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-4">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          required
            ? "bg-amber-50 text-amber-600"
            : "bg-green-50 text-green-600"
        }`}
      >
        {required ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
      </div>

      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Icon size={16} className="text-gray-500" />

          <Text size="2" weight="bold" className="text-gray-900">
            {title}
          </Text>

          <Badge
            color={required ? "amber" : "green"}
            variant="soft"
            radius="full"
          >
            {required ? "Required" : "Granted"}
          </Badge>
        </div>

        <Text as="p" size="1" color="gray" className="mt-1 leading-5">
          {description}
        </Text>
      </div>
    </div>
  );
};