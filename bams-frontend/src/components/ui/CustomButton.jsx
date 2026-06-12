import { Button } from "@radix-ui/themes";

const CustomButton = ({
  children,
  className = "",
  variant = "solid",
  size = "2",
  color = "blue",
  radius = "large",
  onClick,
  disabled = false,
  type = "button",
  ...props
}) => {
  return (
    <Button
      type={type}
      variant={variant}
      size={size}
      color={color}
      radius={radius}
      className={className}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {children}
    </Button>
  );
};

export default CustomButton;
