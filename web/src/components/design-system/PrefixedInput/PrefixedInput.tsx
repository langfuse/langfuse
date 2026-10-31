import { type InputHTMLAttributes, type Ref } from "react";
import { InputControl } from "../internal/InputControl/InputControl";

/** PrefixedInput renders a text input after an optional shaded addon and a muted prefix inside one shared border. */
export function PrefixedInput({
  addon,
  prefix,
  error,
  ref,
  ...props
}: Pick<
  InputHTMLAttributes<HTMLInputElement>,
  | "aria-describedby"
  | "aria-invalid"
  | "id"
  | "inputMode"
  | "name"
  | "onBlur"
  | "onChange"
  | "placeholder"
  | "value"
> & {
  addon?: string;
  prefix: string;
  error?: boolean;
  ref?: Ref<HTMLInputElement>;
}) {
  return (
    <InputControl
      contentLayout="text"
      error={error}
      prefix={prefix}
      addon={addon}
    >
      <input {...props} data-1p-ignore ref={ref} />
    </InputControl>
  );
}
