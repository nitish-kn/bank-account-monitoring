/**
 * Shared labeled text input: optional icon (left or right), optional
 * trailing custom element (e.g. a show/hide-password toggle), and a
 * label that always sits on its own line above the field.
 *
 * `icon` is opt-in — pass a lucide-react icon component to show one,
 * or leave it out entirely for a plain input. Padding adjusts itself
 * based on what's actually present, so callers never need to hand-tune
 * spacing or fake away an icon they don't want.
 */
const CustomInput = ({
  value = "",
  onChange,
  placeholder = "",
  icon: Icon,
  iconPosition = "left",
  endAdornment,
  disabled = false,
  className = "",
  inputClassName = "",
  iconClassName = "",
  type = "text",
  labelText = "",
  id,
  ...props
}) => {
  const hasLeftIcon = Boolean(Icon) && iconPosition === "left";
  const hasRightIcon = Boolean(Icon) && iconPosition === "right";
  const hasRightSlot = hasRightIcon || Boolean(endAdornment);

  return (
    <div className={className}>
      {labelText && (
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">
          {labelText}
        </label>
      )}

      <div className="relative">
        {hasLeftIcon && (
          <Icon
            className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 ${iconClassName}`}
          />
        )}

        <input
          id={id}
          type={type}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(event) => onChange?.(event.target.value, event)}
          className={`h-9 w-full rounded-lg border border-gray-300 bg-white text-sm text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 ${hasLeftIcon ? "pl-10" : "pl-3"} ${hasRightSlot ? "pr-10" : "pr-3"} ${inputClassName}`}
          {...props}
        />

        {hasRightIcon && (
          <Icon
            className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 ${iconClassName}`}
          />
        )}

        {!hasRightIcon && endAdornment && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">{endAdornment}</div>
        )}
      </div>
    </div>
  );
};

export default CustomInput;
