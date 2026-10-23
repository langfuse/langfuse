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
  | "max"
  | "min"
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
  /**
   * `inline` sits within a sentence and grows and shrinks with its value;
   * place it in a `w-fit` container.
   */
  layout?: "block" | "inline";
  ref?: Ref<HTMLInputElement>;
};

export function Input({
  allowPasswordManager,
  error,
  layout = "block",
  ref,
  ...props
}: InputProps) {
  return (
    <InputControl contentLayout="text" error={error}>
      <input
        {...props}
        className={layout === "inline" ? "field-sizing-content" : undefined}
        {...(!allowPasswordManager && { "data-1p-ignore": true })}
        ref={ref}
      />
    </InputControl>
  );
}
