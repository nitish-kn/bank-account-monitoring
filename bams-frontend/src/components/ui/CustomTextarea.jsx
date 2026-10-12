const CustomTextarea = ({
  value = "",
  onChange,
  placeholder = "",
  disabled = false,
  className = "",
  textareaClassName = "",
  labelText = "",
  id,
  rows = 3,
  ...props
}) => {
  return (
    <div className={className}>
      {labelText && (
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">
          {labelText}
        </label>
      )}

      <textarea
        id={id}
        rows={rows}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange?.(event.target.value, event)}
        className={`min-h-20 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 ${textareaClassName}`}
        {...props}
      />
    </div>
  );
};

export default CustomTextarea;
