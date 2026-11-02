import {
  useRef,
  type InputHTMLAttributes,
  type MouseEvent,
  type Ref,
  type RefObject,
} from "react";

import { cn } from "@/src/utils/tailwind";

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
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div
      className={cn(
        "bg-background ring-offset-background focus-within:ring-ring flex h-8 w-full min-w-0 cursor-text items-center overflow-hidden rounded-md border text-sm focus-within:ring-2 focus-within:ring-offset-2",
        borderClassName(error),
      )}
      onMouseDown={(event) => focusInput(event, inputRef)}
    >
      {addon && (
        <span className="bg-muted text-muted-foreground border-input flex h-full shrink-0 items-center border-r px-2.5 font-mono text-xs">
          {addon}
        </span>
      )}
      <span className="text-foreground-secondary shrink-0 pr-0.5 pl-3">
        {prefix}
      </span>
      <input
        {...props}
        className="placeholder:text-muted-foreground h-full min-w-0 flex-1 border-0 bg-transparent py-0 pr-3 pl-0 text-sm shadow-none outline-hidden focus:ring-0"
        data-1p-ignore
        ref={(input) => attachInput(input, inputRef, ref)}
      />
    </div>
  );
}

/** borderClassName colors the shared border and focus ring for the error state. */
function borderClassName(error: boolean | undefined): string {
  if (error) {
    return "border-destructive focus-within:ring-destructive/40 focus-within:ring-offset-0";
  }
  return "border-input";
}

/** focusInput moves focus to the input when the addon or prefix is pressed. */
function focusInput(
  event: MouseEvent<HTMLDivElement>,
  inputRef: RefObject<HTMLInputElement | null>,
) {
  if (event.target === inputRef.current) return;
  event.preventDefault();
  inputRef.current?.focus();
}

/** attachInput stores the input locally and forwards it to the caller's ref. */
function attachInput(
  input: HTMLInputElement | null,
  inputRef: RefObject<HTMLInputElement | null>,
  ref: Ref<HTMLInputElement> | undefined,
) {
  inputRef.current = input;
  if (typeof ref === "function") ref(input);
  else if (ref) ref.current = input;
}
