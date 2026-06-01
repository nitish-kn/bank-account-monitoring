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
}) => {
  return (
    <Button
      variant={variant}
      size={size}
      color={color}
      radius={radius}
      className={className}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </Button>
  );
};

export default CustomButton;