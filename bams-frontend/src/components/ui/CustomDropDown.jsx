import { DropdownMenu } from "@radix-ui/themes";
import { Check, ChevronDown } from "lucide-react";
import CustomButton from "./CustomButton";

const normalizeOption = (option) => {
  if (typeof option === "string" || typeof option === "number") {
    return {
      label: String(option),
      value: option,
    };
  }

  return {
    label: option?.label ?? String(option?.value ?? ""),
    value: option?.value,
    disabled: option?.disabled,
  };
};

const CustomDropDown = ({
  options = [],
  value,
  placeholder = "Select",
  onValueChange,
  open,
  onOpenChange,
  disabled = false,
  align = "end",
  side = "bottom",
  triggerClassName = "",
  contentClassName = "",
  itemClassName = "",
  buttonVariant = "soft",
  buttonColor = "blue",
  buttonSize = "1",
  buttonRadius = "large",
}) => {
  const normalizedOptions = options.map(normalizeOption);
  const selectedOption = normalizedOptions.find(
    (option) => String(option.value) === String(value),
  );

  return (
    <DropdownMenu.Root open={open} onOpenChange={onOpenChange}>
      <DropdownMenu.Trigger disabled={disabled}>
        <CustomButton
          variant={buttonVariant}
          color={buttonColor}
          size={buttonSize}
          radius={buttonRadius}
          disabled={disabled}
          className={`inline-flex items-center gap-1.5 ${triggerClassName}`}
        >
          <span>{selectedOption?.label || placeholder}</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </CustomButton>
      </DropdownMenu.Trigger>

      <DropdownMenu.Content
        align={align}
        side={side}
        className={`min-w-24 ${contentClassName}`}
      >
        {normalizedOptions.map((option) => {
          const isSelected = String(option.value) === String(value);

          return (
            <DropdownMenu.Item
              key={String(option.value)}
              disabled={option.disabled}
              onSelect={() => onValueChange?.(option.value, option)}
              className={`flex items-center justify-between gap-3 ${itemClassName}`}
            >
              <span>{option.label}</span>
              {isSelected ? <Check className="h-3.5 w-3.5" /> : null}
            </DropdownMenu.Item>
          );
        })}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
};

export default CustomDropDown;
