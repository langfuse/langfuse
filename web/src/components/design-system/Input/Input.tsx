import { useRef, type InputHTMLAttributes, type Ref } from "react";
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
  /** Fixed content inside the border before the value: a shaded `addon` segment, then muted `text`. */
  prefix?: InputPrefix;
  ref?: Ref<HTMLInputElement>;
};

export function Input({
  allowPasswordManager,
  error,
  layout = "block",
  prefix,
  ref,
  ...props
}: InputProps) {
  if (prefix) {
    return (
      <PrefixedInput
        {...props}
        prefix={prefix}
        error={error}
        allowPasswordManager={allowPasswordManager}
        ref={ref}
      />
    );
  }

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

/** PrefixedInput renders the input after its prefix inside one shared border. */
function PrefixedInput({
  allowPasswordManager,
  error,
  prefix,
  ref,
  ...props
}: Omit<InputProps, "layout" | "prefix"> & { prefix: InputPrefix }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const attachInput = (input: HTMLInputElement | null) => {
    inputRef.current = input;
    if (typeof ref === "function") ref(input);
    else if (ref) ref.current = input;
  };

  return (
    <InputControl
      contentLayout="prefixed"
      error={error}
      disabled={props.disabled}
    >
      <div
        onMouseDown={(event) => {
          if (event.target === inputRef.current) return;
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        {prefix.addon && (
          <span className="bg-muted text-muted-foreground border-input flex h-full shrink-0 items-center border-r px-2.5 font-mono text-xs">
            {prefix.addon}
          </span>
        )}
        {prefix.text && (
          <span className="text-foreground-secondary shrink-0 pr-0.5 pl-3">
            {prefix.text}
          </span>
        )}
        <input
          {...props}
          className="placeholder:text-muted-foreground h-full min-w-0 flex-1 border-0 bg-transparent py-0 pr-3 pl-0 text-sm shadow-none outline-hidden focus:ring-0 disabled:cursor-not-allowed"
          {...(!allowPasswordManager && { "data-1p-ignore": true })}
          ref={attachInput}
        />
      </div>
    </InputControl>
  );
}

/** InputPrefix is the fixed content an input shows before its value. */
type InputPrefix = { addon?: string; text?: string };
