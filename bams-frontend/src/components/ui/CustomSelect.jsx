import { DropdownMenu, Select } from "@radix-ui/themes";
import { ChevronDown, Search } from "lucide-react";
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

const CustomSelect = ({
  options = [],
  value,
  defaultValue,
  multiple = false,
  placeholder = "Select",
  disabled = false,
  showSearch = false,
  searchPlaceholder = "Search options...",
  emptyMessage = "No options found",
  maxSelectedLabels = 2,
  onValueChange,
  size = "1",
  triggerClassName = "",
  contentClassName = "",
  itemClassName = "",
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
      option.label.toLowerCase().includes(term),
    );
  }, [normalizedOptions, searchTerm, showSearch]);

  const selectedValue = value === undefined || value === null ? undefined : String(value);
  const initialValue = defaultValue === undefined || defaultValue === null ? undefined : String(defaultValue);
  const selectedValues = useMemo(() => {
    const rawValues = Array.isArray(value)
      ? value
      : Array.isArray(defaultValue)
        ? defaultValue
        : [];

    return rawValues.map((item) => String(item));
  }, [defaultValue, value]);

  const selectedOptions = useMemo(
    () => normalizedOptions.filter((option) => selectedValues.includes(String(option.value))),
    [normalizedOptions, selectedValues],
  );

  const triggerLabel = useMemo(() => {
    if (!selectedOptions.length) return placeholder;

    const visibleLabels = selectedOptions
      .slice(0, maxSelectedLabels)
      .map((option) => option.label)
      .join(", ");

    if (selectedOptions.length <= maxSelectedLabels) return visibleLabels;

    return `${visibleLabels} +${selectedOptions.length - maxSelectedLabels}`;
  }, [maxSelectedLabels, placeholder, selectedOptions]);

  const handleValueChange = (nextValue) => {
    const selectedOption = normalizedOptions.find(
      (option) => String(option.value) === String(nextValue),
    );

    onValueChange?.(selectedOption?.value ?? nextValue, selectedOption);
  };

  const handleMultiValueChange = (option, checked) => {
    const optionValue = String(option.value);
    const nextSelectedValues = checked
      ? [...selectedValues, optionValue]
      : selectedValues.filter((selectedItem) => selectedItem !== optionValue);

    const nextOptions = normalizedOptions.filter((item) =>
      nextSelectedValues.includes(String(item.value)),
    );

    onValueChange?.(
      nextOptions.map((item) => item.value),
      nextOptions,
    );
  };

  if (multiple) {
    return (
      <DropdownMenu.Root>
        <DropdownMenu.Trigger disabled={disabled}>
          <CustomButton
            disabled={disabled}
            variant="soft"
            color="gray"
            size={size}
            className={`inline-flex items-center justify-between gap-2 ${triggerClassName}`}
          >
            <span className="truncate">{triggerLabel}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          </CustomButton>
        </DropdownMenu.Trigger>

        <DropdownMenu.Content
          align="start"
          className={`min-w-48 ${contentClassName}`}
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
              const isSelected = selectedValues.includes(String(option.value));

              return (
                <DropdownMenu.CheckboxItem
                  key={String(option.value)}
                  checked={isSelected}
                  disabled={option.disabled}
                  onCheckedChange={(checked) => handleMultiValueChange(option, checked === true)}
                  onSelect={(event) => event.preventDefault()}
                  className={itemClassName}
                >
                  {option.label}
                </DropdownMenu.CheckboxItem>
              );
            })
          ) : (
            <div className="px-3 py-2 text-sm text-gray-400">{emptyMessage}</div>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    );
  }

  return (
    <Select.Root
      value={selectedValue}
      defaultValue={initialValue}
      disabled={disabled}
      onValueChange={handleValueChange}
    >
      <Select.Trigger
        size={size}
        placeholder={placeholder}
        className={triggerClassName}
      />

      <Select.Content
        position="popper"
        className={contentClassName}
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

        <Select.Group>
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <Select.Item
                key={String(option.value)}
                value={String(option.value)}
                disabled={option.disabled}
                className={itemClassName}
              >
                {option.label}
              </Select.Item>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-gray-400">{emptyMessage}</div>
          )}
        </Select.Group>
      </Select.Content>
    </Select.Root>
  );
};

export default CustomSelect;
