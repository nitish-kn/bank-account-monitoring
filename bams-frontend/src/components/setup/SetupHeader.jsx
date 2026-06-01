import { Badge, Heading, Text } from "@radix-ui/themes";

export function SetupHeader({
  icon: Icon,
  title,
  subtitle,
  badge,
  badgeColor = "blue",
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-4">
        <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <Icon size={26} />
        </div>

        <div>
          <Heading size="6" className="text-gray-950">
            {title}
          </Heading>

          {subtitle && (
            <Text as="p" size="1" color="gray" className="mt-2 max-w-xl leading-6">
              {subtitle}
            </Text>
          )}
        </div>
      </div>

      {badge && (
        <Badge color={badgeColor} variant="soft" radius="full" size="2">
          {badge}
        </Badge>
      )}
    </div>
  );
}