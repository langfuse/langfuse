import type { KeyboardEvent } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";

type SpielwiesePlaygroundComposerProps = {
  onSubmit: () => void;
  onValueChange: (value: string) => void;
  value: string;
};

const playgroundComposerTextareaClassName =
  "placeholder:text-foreground/38 max-h-40 min-h-[2.75rem] border-0 bg-transparent px-2.5 py-2 text-[13px] leading-5 shadow-none focus-visible:ring-0";

function shouldSubmitFromComposerShortcut({
  canSubmit,
  event,
}: {
  canSubmit: boolean;
  event: KeyboardEvent<HTMLTextAreaElement>;
}) {
  return (
    event.key === "Enter" &&
    !event.shiftKey &&
    (event.metaKey || event.ctrlKey) &&
    canSubmit
  );
}

export function SpielwiesePlaygroundComposer({
  onSubmit,
  onValueChange,
  value,
}: SpielwiesePlaygroundComposerProps) {
  const canSubmit = value.trim().length > 0;

  return (
    <div
      className="sticky bottom-0 z-10 -mx-4 flex shrink-0 px-4 pt-3 pb-4"
      data-testid="spielwiese-playground-composer-shell"
    >
      <form
        className="flex w-1/2 items-end gap-2 rounded-[24px] border border-black/8 bg-[rgba(255,255,255,0.92)] p-2 shadow-[0_12px_34px_rgba(15,23,42,0.08),0_2px_8px_rgba(15,23,42,0.04)] supports-[backdrop-filter]:bg-[rgba(255,255,255,0.76)] supports-[backdrop-filter]:backdrop-blur-md"
        data-testid="spielwiese-playground-composer-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) {
            onSubmit();
          }
        }}
      >
        <div className="min-w-0 flex-1">
          <label className="sr-only" htmlFor="spielwiese-playground-input">
            Playground input
          </label>
          <Textarea
            className={playgroundComposerTextareaClassName}
            data-testid="spielwiese-playground-input"
            id="spielwiese-playground-input"
            placeholder="Type a test input for the workflow"
            rows={1}
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            onKeyDown={(event) => {
              if (shouldSubmitFromComposerShortcut({ canSubmit, event })) {
                event.preventDefault();
                onSubmit();
              }
            }}
          />
        </div>
        <Button
          aria-label="Run playground input"
          className="h-10 w-10 rounded-full bg-[#15181C] text-white shadow-[0_8px_18px_rgba(15,23,42,0.18)] hover:bg-[#202427] focus-visible:ring-1 focus-visible:ring-black/12 focus-visible:ring-offset-0 disabled:bg-[#E6E8EB] disabled:text-[#A7ADB4] disabled:opacity-100"
          data-testid="spielwiese-playground-submit-button"
          disabled={!canSubmit}
          size="icon"
          type="submit"
          variant="ghost"
        >
          <ArrowUp aria-hidden="true" className="size-4 shrink-0" />
        </Button>
      </form>
    </div>
  );
}
