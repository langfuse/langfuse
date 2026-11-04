import { type ComponentProps, type InputHTMLAttributes, type Ref } from "react";
import { cva } from "class-variance-authority";
import { InputControl } from "../internal/InputControl/InputControl";

const inputVariants = cva(
  "placeholder:text-muted-foreground text-sm disabled:cursor-not-allowed",
  {
    variants: {
      valuePrefixed: {
        true: "h-full min-w-0 flex-1 border-0 bg-transparent p-0 shadow-none outline-hidden focus:ring-0",
        false: null,
      },
      layout: {
        block: null,
        inline: "field-sizing-content",
      },
    },
  },
);

const valuePrefixControlVariants = cva(
  "flex min-w-0 cursor-text items-center overflow-hidden px-3",
  {
    variants: {
      standalone: {
        true: "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        false: null,
      },
      error: {
        true: null,
        false: null,
      },
    },
    compoundVariants: [
      {
        standalone: true,
        error: true,
        className:
          "focus-within:ring-destructive/40 focus-within:ring-offset-0",
      },
    ],
  },
);

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
  if (valuePrefix === undefined) {
    return (
      <InputControl
        contentLayout="text"
        error={error}
        disabled={disabled}
        prefix={prefix}
      >
        <input
          {...props}
          className={inputVariants({ valuePrefixed: false, layout })}
          {...(!allowPasswordManager && { "data-1p-ignore": true })}
          ref={ref}
          disabled={disabled}
        />
      </InputControl>
    );
  }

  return (
    <InputControl
      contentLayout="none"
      error={error}
      disabled={disabled}
      prefix={prefix}
    >
      <div
        className={valuePrefixControlVariants({ error, standalone: !prefix })}
        onMouseDown={(event) => {
          const input = event.currentTarget.querySelector("input");
          if (event.target === input) return;
          event.preventDefault();
          input?.focus();
        }}
      >
        <span className="text-foreground-secondary shrink-0 pr-0.5">
          {valuePrefix}
        </span>
        <input
          {...props}
          className={inputVariants({ valuePrefixed: true, layout })}
          {...(!allowPasswordManager && { "data-1p-ignore": true })}
          ref={ref}
          disabled={disabled}
        />
      </div>
    </InputControl>
  );
}
