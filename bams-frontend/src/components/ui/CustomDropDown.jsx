import { DropdownMenu } from "@radix-ui/themes";
import { Check, ChevronDown, Search } from "lucide-react";
import { useMemo, useState } from "react";
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
  multiple = false,
  placeholder = "Select",
  onValueChange,
  open,
  onOpenChange,
  disabled = false,
  showSearch = false,
  searchPlaceholder = "Search options...",
  emptyMessage = "No options found",
  maxSelectedLabels = 2,
  allValue = "all",
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
  const [searchTerm, setSearchTerm] = useState("");

  const normalizedOptions = useMemo(
    () => options.map(normalizeOption).filter((option) => option.value !== undefined),
    [options],
  );

  const filteredOptions = useMemo(() => {
    if (!showSearch || !searchTerm.trim()) return normalizedOptions;

    const term = searchTerm.trim().toLowerCase();
    return normalizedOptions.filter((option) =>
      String(option.label).toLowerCase().includes(term),
    );
  }, [normalizedOptions, searchTerm, showSearch]);

  const selectedValues = useMemo(() => {
    const rawValues = Array.isArray(value)
      ? value
      : value === undefined || value === null || String(value) === String(allValue)
        ? []
        : [value];

    return rawValues.map((item) => String(item));
  }, [allValue, value]);

  const selectedOption = normalizedOptions.find(
    (option) => String(option.value) === String(value),
  );

  const selectedOptions = useMemo(
    () => normalizedOptions.filter((option) => selectedValues.includes(String(option.value))),
    [normalizedOptions, selectedValues],
  );

  const triggerLabel = useMemo(() => {
    if (!multiple) return selectedOption?.label || placeholder;
    if (!selectedOptions.length) return placeholder;

    const visibleLabels = selectedOptions
      .slice(0, maxSelectedLabels)
      .map((option) => option.label)
      .join(", ");

    if (selectedOptions.length <= maxSelectedLabels) return visibleLabels;

    return `${visibleLabels} +${selectedOptions.length - maxSelectedLabels}`;
  }, [maxSelectedLabels, multiple, placeholder, selectedOption, selectedOptions]);

  const handleOpenChange = (nextOpen) => {
    if (!nextOpen) {
      setSearchTerm("");
    }

    onOpenChange?.(nextOpen);
  };

  const handleMultiValueChange = (option, checked) => {
    const optionValue = String(option.value);

    if (optionValue === String(allValue)) {
      onValueChange?.(allValue, [option]);
      return;
    }

    const nextSelectedValues = checked
      ? [...selectedValues, optionValue]
      : selectedValues.filter((selectedItem) => selectedItem !== optionValue);

    const nextOptions = normalizedOptions.filter((item) =>
      nextSelectedValues.includes(String(item.value)) &&
      String(item.value) !== String(allValue),
    );

    onValueChange?.(
      nextOptions.length ? nextOptions.map((item) => item.value) : allValue,
      nextOptions,
    );
  };

  return (
    <DropdownMenu.Root open={open} onOpenChange={handleOpenChange}>
      <DropdownMenu.Trigger disabled={disabled}>
        <CustomButton
          variant={buttonVariant}
          color={buttonColor}
          size={buttonSize}
          radius={buttonRadius}
          disabled={disabled}
          className={`inline-flex items-center justify-between gap-1.5 ${triggerClassName}`}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </CustomButton>
      </DropdownMenu.Trigger>

      <DropdownMenu.Content
        align={align}
        side={side}
        className={`min-w-24 ${contentClassName}`}
      >
        {showSearch ? (
          <div className="sticky top-0 z-10 border-b border-gray-100 bg-white p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onKeyDown={(event) => event.stopPropagation()}
                placeholder={searchPlaceholder}
                className="h-8 w-full rounded-md border border-gray-200 bg-white pl-7 pr-2 text-sm text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        ) : null}

        {filteredOptions.length > 0 ? (
          filteredOptions.map((option) => {
            const optionValue = String(option.value);
            const isAllOption = optionValue === String(allValue);
            const isSelected = multiple
              ? isAllOption
                ? selectedValues.length === 0
                : selectedValues.includes(optionValue)
              : optionValue === String(value);

            if (multiple) {
              return (
                <DropdownMenu.CheckboxItem
                  key={optionValue}
                  checked={isSelected}
                  disabled={option.disabled}
                  onCheckedChange={(checked) => handleMultiValueChange(option, checked === true)}
                  onSelect={(event) => event.preventDefault()}
                  className={itemClassName}
                >
                  {option.label}
                </DropdownMenu.CheckboxItem>
              );
            }

            return (
              <DropdownMenu.Item
                key={optionValue}
                disabled={option.disabled}
                onSelect={() => onValueChange?.(option.value, option)}
                className={`flex items-center justify-between gap-3 ${itemClassName}`}
              >
                <span>{option.label}</span>
                {isSelected ? <Check className="h-3.5 w-3.5" /> : null}
              </DropdownMenu.Item>
            );
          })
        ) : (
          <div className="px-3 py-2 text-sm text-gray-400">{emptyMessage}</div>
        )}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
};

export default CustomDropDown;
