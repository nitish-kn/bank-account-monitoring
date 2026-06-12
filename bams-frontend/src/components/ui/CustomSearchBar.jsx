import { Search } from "lucide-react";

const CustomSearchBar = ({
  value = "",
  onChange,
  placeholder = "Search...",
  iconPosition = "left",
  disabled = false,
  className = "",
  inputClassName = "",
  iconClassName = "",
  type = "text",
  ...props
}) => {
  const isIconRight = iconPosition === "right";
  const iconPositionClass = isIconRight ? "right-3" : "left-3";
  const inputPaddingClass = isIconRight ? "pr-10 pl-3" : "pl-10 pr-4";

  return (
    <div className={`relative ${className}`}>
      <Search
        className={`pointer-events-none absolute ${iconPositionClass} top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 ${iconClassName}`}
      />
      <input
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange?.(event.target.value, event)}
        className={`h-9 w-full rounded-lg border border-gray-300 bg-white py-2 text-sm text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 ${inputPaddingClass} ${inputClassName}`}
        {...props}
      />
    </div>
  );
};

export default CustomSearchBar;
