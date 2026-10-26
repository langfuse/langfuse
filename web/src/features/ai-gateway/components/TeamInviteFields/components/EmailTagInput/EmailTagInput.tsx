import { type ChangeEvent, type KeyboardEvent, type ReactNode } from "react";

import { EmailTag } from "@/src/features/ai-gateway/components/TeamInviteFields/components/EmailTagInput/components/EmailTag";
import {
  appendEmails,
  splitEmailText,
} from "@/src/features/ai-gateway/components/TeamInviteFields/components/EmailTagInput/fns/emailText";
import { getInviteeKind } from "@/src/features/ai-gateway/fns/getInviteeKind";
import type { TeamInviteMembers } from "@/src/features/ai-gateway/types/teamInviteMembers";

export type EmailTagInputProps = {
  id: string;
  value: string[];
  onChange: (emails: string[]) => void;
  /** Text not turned into a chip yet; without an `@` it is a member search. */
  draft: string;
  onDraftChange: (draft: string) => void;
  /** Called on Enter while the draft is a search, to pick the top match. */
  onPickTopSuggestion?: () => void;
  members: TeamInviteMembers;
  "aria-describedby"?: string;
  /** Chips shown before the addresses. */
  children?: ReactNode;
};

/** Typed text with an `@` is an address; anything else is a search term. */
function isAddress(text: string) {
  return text.includes("@");
}

/**
 * Turns typed or pasted addresses into removable chips on comma, space, Enter, or
 * blur. Text without an `@` stays a search, and Enter picks the top suggestion.
 * Borderless: the surrounding field draws the frame.
 */
export function EmailTagInput({
  id,
  value,
  onChange,
  draft,
  onDraftChange,
  onPickTopSuggestion,
  members,
  "aria-describedby": ariaDescribedBy,
  children,
}: EmailTagInputProps) {
  function commit(text: string) {
    onDraftChange("");
    if (text.trim().length > 0) onChange(appendEmails(value, text));
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const text = event.target.value;
    if (isAddress(text) && splitEmailText(text).length > 1) commit(text);
    else onDraftChange(text);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      const isSearch = draft.trim().length > 0 && !isAddress(draft);
      if (isSearch && onPickTopSuggestion) onPickTopSuggestion();
      else commit(draft);
      return;
    }
    if (event.key === "Backspace" && draft.length === 0 && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  // A search must survive the blur from clicking a suggestion.
  function handleBlur() {
    if (isAddress(draft)) commit(draft);
  }

  function handleRemove(email: string) {
    onChange(value.filter((candidate) => candidate !== email));
  }

  return (
    <div className="ph-no-capture flex min-h-6 min-w-0 flex-wrap items-center gap-1.5 text-sm">
      {children}
      {value.map((email) => (
        <EmailTag
          key={email}
          email={email}
          kind={getInviteeKind(email, members)}
          memberName={members.get(email)?.name}
          onRemove={handleRemove}
        />
      ))}
      <input
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
        className="placeholder:text-muted-foreground h-6 min-w-24 flex-1 border-0 bg-transparent p-0 text-sm shadow-none outline-hidden focus:ring-0"
        value={draft}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
    </div>
  );
}
