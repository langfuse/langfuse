import {
  useState,
  type ChangeEvent,
  type SyntheticEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { BotMessageSquare } from "lucide-react";

import { Button } from "@/src/components/design-system/Button/Button";
import { cn } from "@/src/utils/tailwind";

import styles from "./EvaluatorGalleryAiBox.module.css";

type EvaluatorGalleryAiBoxProps = {
  /** Resolves false when the prompt was not sent; the text is kept. */
  onSubmit: (prompt: string) => Promise<boolean>;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
};

/** Free-text starting point that hands the description to the assistant. */
export function EvaluatorGalleryAiBox({
  onSubmit,
  textareaRef,
}: EvaluatorGalleryAiBoxProps) {
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notSent, setNotSent] = useState(false);
  const trimmedPrompt = prompt.trim();

  const submitPrompt = async () => {
    if (!trimmedPrompt || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const sent = await onSubmit(trimmedPrompt);
      setNotSent(!sent);
      if (sent) setPrompt("");
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitPrompt().catch(() => undefined);
  };
  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(event.target.value);
    setNotSent(false);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submitPrompt().catch(() => undefined);
    }
  };

  return (
    <form
      className={cn(
        styles.box,
        "bg-popover focus-within:border-foreground/40 focus-within:ring-foreground/5 flex flex-col gap-1 rounded-xl border p-3 focus-within:ring-4",
      )}
      onSubmit={handleSubmit}
    >
      <textarea
        ref={textareaRef}
        value={prompt}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        rows={2}
        aria-label="Describe what you want to check"
        placeholder="Describe what you want to check, e.g. flag replies with medical advice"
        className="placeholder:text-muted-foreground w-full resize-none border-0 bg-transparent p-0 text-base shadow-none outline-hidden focus:ring-0"
      />
      <div className="flex items-center justify-end gap-3">
        {notSent ? (
          <p role="status" className="text-muted-foreground text-xs">
            Not sent. The assistant may be busy or rate limited, try again
            shortly.
          </p>
        ) : null}
        <Button
          type="submit"
          variant="secondary"
          icon={BotMessageSquare}
          text="Build with AI"
          disabled={!trimmedPrompt || isSubmitting}
        />
      </div>
    </form>
  );
}
