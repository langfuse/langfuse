import { type ComponentProps, type InputHTMLAttributes, type Ref } from "react";
import { cn } from "@/src/utils/tailwind";
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
  /** Shaded label and/or decorative icon before the editable value. */
  prefix?: ComponentProps<typeof InputControl>["prefix"];
  /** Uneditable text displayed as part of the value, e.g. https://. */
  valuePrefix?: string;
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
  prefix,
  valuePrefix,
  ref,
  disabled,
  ...props
}: InputProps) {
  const input = (
    <input
      {...props}
      className={cn(
        valuePrefix !== undefined &&
          "placeholder:text-muted-foreground h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-sm shadow-none outline-hidden focus:ring-0 disabled:cursor-not-allowed",
        layout === "inline" && "field-sizing-content",
      )}
      {...(!allowPasswordManager && { "data-1p-ignore": true })}
      ref={ref}
      disabled={disabled}
    />
  );

  return (
    <InputControl
      contentLayout={valuePrefix !== undefined ? "composite" : "text"}
      error={error}
      disabled={disabled}
      prefix={prefix}
    >
      {valuePrefix !== undefined ? (
        <div>
          <span className="text-foreground-secondary shrink-0 pr-0.5">
            {valuePrefix}
          </span>
          {input}
        </div>
      ) : (
        input
      )}
    </InputControl>
  );
}
