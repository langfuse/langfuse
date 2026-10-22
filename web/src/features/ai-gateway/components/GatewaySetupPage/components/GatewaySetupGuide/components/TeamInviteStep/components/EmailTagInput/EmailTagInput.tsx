import { useState, type ChangeEvent, type KeyboardEvent } from "react";

import { EmailTag } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/TeamInviteStep/components/EmailTagInput/components/EmailTag";
import { appendEmails } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/TeamInviteStep/fns/appendEmails";
import { isEmailAddress } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/components/TeamInviteStep/fns/isEmailAddress";

export type EmailTagInputProps = {
  id: string;
  value: string[];
  onChange: (emails: string[]) => void;
  "aria-describedby"?: string;
};

/** Turns typed or pasted addresses into removable chips on comma, Enter, or blur. */
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
    if (text.includes(",")) commit(text);
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
    <div className="border-input bg-background ring-offset-background focus-within:ring-ring ph-no-capture flex min-h-8 w-full flex-wrap items-center gap-1 rounded-md border px-1.5 py-1 text-sm focus-within:ring-2 focus-within:ring-offset-2">
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
        placeholder={value.length === 0 ? "name@company.com" : undefined}
        aria-describedby={ariaDescribedBy}
        className="placeholder:text-muted-foreground min-w-40 flex-1 bg-transparent px-1 outline-hidden"
        value={draft}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
    </div>
  );
}
