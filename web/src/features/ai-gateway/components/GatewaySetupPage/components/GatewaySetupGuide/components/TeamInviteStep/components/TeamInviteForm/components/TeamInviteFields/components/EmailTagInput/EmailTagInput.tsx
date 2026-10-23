import { useState, type ChangeEvent, type KeyboardEvent } from "react";

import { EmailTag } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/TeamInviteStep/components/TeamInviteForm/components/TeamInviteFields/components/EmailTagInput/components/EmailTag";
import {
  appendEmails,
  splitEmailText,
} from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/TeamInviteStep/components/TeamInviteForm/components/TeamInviteFields/components/EmailTagInput/fns/emailText";
import { isEmailAddress } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/TeamInviteStep/components/TeamInviteForm/fns/isEmailAddress";

export type EmailTagInputProps = {
  id: string;
  value: string[];
  onChange: (emails: string[]) => void;
  "aria-describedby"?: string;
};

/**
 * Turns typed or pasted addresses into removable chips on comma, space, Enter, or
 * blur. Borderless: the surrounding field draws the frame.
 */
export function EmailTagInput({
  id,
  value,
  onChange,
  "aria-describedby": ariaDescribedBy,
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
      {value.map((email) => (
        <EmailTag
          key={email}
          email={email}
          invalid={!isEmailAddress(email)}
          onRemove={handleRemove}
        />
      ))}
      <input
        id={id}
        type="text"
        inputMode="email"
        autoComplete="off"
        data-1p-ignore
        placeholder={value.length === 0 ? "jsdoe@example.com" : undefined}
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
