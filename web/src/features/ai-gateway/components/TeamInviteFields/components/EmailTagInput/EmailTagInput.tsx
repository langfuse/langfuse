import {
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

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
  members: TeamInviteMembers;
  "aria-describedby"?: string;
  /** Chips shown before the addresses. */
  children?: ReactNode;
};

/**
 * Turns typed or pasted addresses into removable chips on comma, space, Enter, or
 * blur. Borderless: the surrounding field draws the frame.
 */
export function EmailTagInput({
  id,
  value,
  onChange,
  members,
  "aria-describedby": ariaDescribedBy,
  children,
}: EmailTagInputProps) {
  const [draft, setDraft] = useState("");

  function commit(text: string) {
    setDraft("");
    if (text.trim().length > 0) onChange(appendEmails(value, text));
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const text = event.target.value;
    if (splitEmailText(text).length > 1) commit(text);
    else setDraft(text);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit(draft);
      return;
    }
    if (event.key === "Backspace" && draft.length === 0 && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  function handleBlur() {
    commit(draft);
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
