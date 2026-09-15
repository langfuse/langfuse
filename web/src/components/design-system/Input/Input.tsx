import { type InputHTMLAttributes, type Ref } from "react";
import { InputControl } from "../internal/InputControl/InputControl";

type InputProps = Pick<
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
  | "inputMode"
  | "maxLength"
  | "minLength"
  | "name"
  | "onBlur"
  | "onChange"
  | "onFocus"
  | "placeholder"
  | "readOnly"
  | "required"
  | "tabIndex"
  | "type"
  | "value"
> & {
  allowPasswordManager?: boolean;
  ref?: Ref<HTMLInputElement>;
};

export function Input({ allowPasswordManager, ref, ...props }: InputProps) {
  return (
    <InputControl contentLayout="text">
      <input
        {...props}
        {...(!allowPasswordManager && { "data-1p-ignore": true })}
        ref={ref}
      />
    </InputControl>
  );
}
