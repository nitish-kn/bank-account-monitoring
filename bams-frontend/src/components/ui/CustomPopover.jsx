import { Popover } from "@radix-ui/themes";

const CustomPopover = ({ trigger, children }) => {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        {trigger}
      </Popover.Trigger>

      <Popover.Content size="1" width="180px">
        {children}
      </Popover.Content>
    </Popover.Root>
  );
};

export default CustomPopover;