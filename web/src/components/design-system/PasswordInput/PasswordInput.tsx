import { useState, type InputHTMLAttributes, type Ref } from "react";
import { Eye, EyeOff } from "lucide-react";
import { InputControl } from "@/src/components/design-system/internal/InputControl/InputControl";

type PasswordInputProps = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  | "aria-describedby"
  | "aria-invalid"
  | "aria-label"
  | "aria-labelledby"
  | "autoComplete"
  | "autoFocus"
  | "defaultValue"
  | "disabled"
  | "id"
  | "name"
  | "onBlur"
  | "onChange"
  | "onFocus"
  | "placeholder"
  | "readOnly"
  | "required"
  | "tabIndex"
  | "value"
> & {
  ref?: Ref<HTMLInputElement>;
};

export function PasswordInput({ ref, disabled, ...props }: PasswordInputProps) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const VisibilityIcon = isPasswordVisible ? EyeOff : Eye;

  return (
    <InputControl
      contentLayout="text"
      trailingAction={{
        label: isPasswordVisible ? "Hide password" : "Show password",
        icon: VisibilityIcon,
        disabled,
        pressed: isPasswordVisible,
        onClick: () => setIsPasswordVisible((visible) => !visible),
      }}
    >
      <input
        {...props}
        ref={ref}
        type={isPasswordVisible ? "text" : "password"}
        disabled={disabled}
      />
    </InputControl>
  );
}
