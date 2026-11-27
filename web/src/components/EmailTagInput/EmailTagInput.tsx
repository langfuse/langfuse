import {
  type ChangeEvent,
  type ClipboardEvent,
  type ComponentProps,
  Fragment,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";

import { Tag } from "@/src/components/design-system/Tag/Tag";
import { InvalidEmailTag } from "@/src/components/EmailTagInput/components/InvalidEmailTag";
import { takeAddresses } from "@/src/components/EmailTagInput/fns/takeAddresses";
import { isEmail } from "@/src/utils/isEmail";

type TagRemove = NonNullable<ComponentProps<typeof Tag>["remove"]>;

export type EmailTagInputProps = {
  id: string;
  value: string[];
  onChange: (emails: string[]) => void;
  /** Text not turned into a chip yet; text without an `@` stays here. */
  draft: string;
  onDraftChange: (draft: string) => void;
  /** Called on Enter while the draft holds no address, e.g. to pick a suggestion. */
  onEnterWithoutAddress?: () => void;
  /** The chip of a valid address, given its `remove`; a plain chip of the address when left out. */
  renderTag?: (email: string, tag: { remove: TagRemove }) => ReactNode;
  "aria-describedby"?: string;
  /** Focuses the input on mount, e.g. as a dialog's first field. */
  autoFocus?: boolean;
  /** Keeps the focus but takes no edits, e.g. while the list is being sent. */
  readOnly?: boolean;
  /** Chips shown before the addresses. */
  children?: ReactNode;
  /** The text input, e.g. for a form to focus it. */
  ref?: Ref<HTMLInputElement | null>;
};

/**
 * Turns typed or pasted addresses into removable chips once a separator,
 * Enter, or blur ends them. Text without an `@` stays in the input, and an
 * entry that is not an address can be pressed to edit it there.
 */
export function EmailTagInput({
  id,
  value,
  onChange,
  draft,
  onDraftChange,
  onEnterWithoutAddress,
  renderTag = (email, { remove }) => <Tag text={email} remove={remove} />,
  "aria-describedby": ariaDescribedBy,
  autoFocus,
  readOnly = false,
  children,
  ref,
}: EmailTagInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle<HTMLInputElement | null, HTMLInputElement | null>(
    ref,
    () => inputRef.current,
    [],
  );

  /** Turns the addresses in `text` into chips; returns whether there were any. */
  function commitAddresses(
    text: string,
    how: Parameters<typeof takeAddresses>[1] = "ended",
  ) {
    if (readOnly) return false;
    const { addresses, rest } = takeAddresses(text, how);
    if (addresses.length > 0) {
      const added = addresses.map((address) => address.toLowerCase());
      onChange([...new Set([...value, ...added])]);
    }
    onDraftChange(rest);
    return addresses.length > 0;
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    commitAddresses(event.target.value, "typing");
  }

  // A paste is a finished list: every address in it becomes a chip at once.
  // It is read from the clipboard because a text input drops line breaks,
  // which would glue a pasted column's addresses together.
  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text");
    event.preventDefault();
    const { selectionStart, selectionEnd } = event.currentTarget;
    commitAddresses(
      draft.slice(0, selectionStart ?? draft.length) +
        pasted +
        draft.slice(selectionEnd ?? draft.length),
      "pasted",
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      const hasCommitted = commitAddresses(draft);
      if (!hasCommitted && draft.trim().length > 0) onEnterWithoutAddress?.();
      return;
    }
    if (
      event.key === "Backspace" &&
      !readOnly &&
      draft.length === 0 &&
      value.length > 0
    ) {
      onChange(value.slice(0, -1));
    }
  }

  const chipCount = value.length;
  // New chips push the input down; scroll it back into view before paint so the caret stays visible.
  useLayoutEffect(() => {
    if (document.activeElement === inputRef.current) {
      inputRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [chipCount]);

  // The pressed remove button goes with its chip, so the focus moves to the input.
  function handleRemove(email: string) {
    onChange(value.filter((candidate) => candidate !== email));
    inputRef.current?.focus();
  }

  function handleEdit(entry: string) {
    handleRemove(entry);
    onDraftChange(draft.length > 0 ? `${draft} ${entry}` : entry);
  }

  return (
    // A long list scrolls inside the field, about five rows of chips tall.
    <div className="has-[input:focus]:border-ring max-h-40 overflow-y-auto rounded-md border px-3 py-2">
      <div className="ph-no-capture flex min-h-6 min-w-0 flex-wrap items-center gap-1.5 text-sm">
        {children}
        {value.map((email) =>
          isEmail(email) ? (
            <Fragment key={email}>
              {renderTag(email, {
                remove: {
                  onRemove: () => handleRemove(email),
                  disabled: readOnly,
                },
              })}
            </Fragment>
          ) : (
            <InvalidEmailTag
              key={email}
              text={email}
              onEdit={() => handleEdit(email)}
              onRemove={() => handleRemove(email)}
              disabled={readOnly}
            />
          ),
        )}
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="email"
          autoComplete="off"
          data-1p-ignore
          placeholder={
            value.length === 0 && !children ? "jsdoe@example.com" : undefined
          }
          aria-label="Email addresses"
          aria-describedby={ariaDescribedBy}
          autoFocus={autoFocus}
          readOnly={readOnly}
          className="placeholder:text-muted-foreground h-6 min-w-24 flex-1 border-0 bg-transparent p-0 text-sm shadow-none outline-hidden focus:ring-0"
          value={draft}
          onChange={handleChange}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          onBlur={() => commitAddresses(draft)}
        />
      </div>
    </div>
  );
}
