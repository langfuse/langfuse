import { type InputHTMLAttributes, type Ref } from "react";
import { InputControl } from "../internal/InputControl/InputControl";

type InputProps = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  | "aria-describedby"
  | "aria-controls"
  | "aria-expanded"
  | "aria-activedescendant"
  | "aria-invalid"
  | "aria-label"
  | "aria-labelledby"
  | "autoComplete"
  | "autoFocus"
  | "defaultValue"
  | "disabled"
  | "id"
  | "inputMode"
  | "maxLength"
  | "minLength"
  | "name"
  | "onBlur"
  | "onChange"
  | "onFocus"
  | "onKeyDown"
  | "placeholder"
  | "readOnly"
  | "required"
  | "role"
  | "tabIndex"
  | "type"
  | "value"
> & {
  allowPasswordManager?: boolean;
  error?: boolean;
  ref?: Ref<HTMLInputElement>;
};

export function Input({
  allowPasswordManager,
  error,
  ref,
  ...props
}: InputProps) {
  return (
    <InputControl contentLayout="text" error={error}>
      <input
        {...props}
        {...(!allowPasswordManager && { "data-1p-ignore": true })}
        ref={ref}
      />
    </InputControl>
  );
}
