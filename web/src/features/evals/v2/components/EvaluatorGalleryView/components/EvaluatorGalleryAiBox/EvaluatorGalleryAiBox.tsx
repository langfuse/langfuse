import { type KeyboardEvent } from "react";
import { useForm } from "react-hook-form";
import { BotMessageSquare } from "lucide-react";

import { Button } from "@/src/components/design-system/Button/Button";
import { cn } from "@/src/utils/tailwind";

import styles from "./EvaluatorGalleryAiBox.module.css";

type EvaluatorGalleryAiBoxProps = {
  /** Resolves false when the prompt was not sent; the text is kept. */
  onSubmit: (prompt: string) => Promise<boolean>;
};

type AiBoxFormValues = { prompt: string };

/** Free-text starting point that hands the description to the assistant. */
export function EvaluatorGalleryAiBox({
  onSubmit,
}: EvaluatorGalleryAiBoxProps) {
  const form = useForm<AiBoxFormValues>({ defaultValues: { prompt: "" } });
  const hasPrompt = form.watch("prompt").trim().length > 0;
  const notSent = Boolean(form.formState.errors.root?.notSent);

  const handleSubmit = form.handleSubmit(async ({ prompt }) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    const sent = await onSubmit(trimmed);
    if (sent) {
      form.reset();
    } else {
      form.setError("root.notSent", { type: "notSent" });
    }
  });
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      handleSubmit().catch(() => undefined);
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
        {...form.register("prompt", {
          onChange: () => form.clearErrors("root.notSent"),
        })}
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
          disabled={!hasPrompt || form.formState.isSubmitting}
        />
      </div>
    </form>
  );
}
