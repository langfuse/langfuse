import type { KeyboardEvent, ReactNode } from "react";
import { ArrowUp, Mic, Plus } from "lucide-react";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";

type SpielwiesePlaygroundComposerProps = {
  onSubmit: () => void;
  onValueChange: (value: string) => void;
  value: string;
};

type ComposerUtilityButtonProps = {
  ariaLabel: string;
  children: ReactNode;
  testId: string;
};

const playgroundComposerTextareaClassName =
  "placeholder:text-foreground/36 h-9 max-h-36 min-h-0 border-0 bg-transparent px-0 py-0 text-[15px] leading-9 shadow-none focus-visible:ring-0";
const playgroundComposerUtilityButtonClassName =
  "text-foreground/74 hover:text-foreground inline-flex h-9 w-9 min-h-9 min-w-9 items-center justify-center rounded-full transition-colors hover:bg-black/4 focus-visible:ring-1 focus-visible:ring-black/10 focus-visible:ring-offset-0";

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

function ComposerUtilityButton({
  ariaLabel,
  children,
  testId,
}: ComposerUtilityButtonProps) {
  return (
    <button
      aria-expanded="false"
      aria-haspopup="menu"
      aria-label={ariaLabel}
      className={playgroundComposerUtilityButtonClassName}
      data-testid={testId}
      type="button"
    >
      {children}
    </button>
  );
}

function ComposerLeadingControl() {
  return (
    <div
      className="flex items-center"
      data-testid="spielwiese-playground-composer-leading"
    >
      <ComposerUtilityButton
        ariaLabel="Add files and more"
        testId="spielwiese-playground-composer-add-button"
      >
        <Plus aria-hidden="true" className="size-4.5 shrink-0" />
      </ComposerUtilityButton>
    </div>
  );
}

function ComposerTrailingControls({ canSubmit }: { canSubmit: boolean }) {
  return (
    <div
      className="ml-auto flex items-center gap-0.5"
      data-testid="spielwiese-playground-composer-trailing"
    >
      <ComposerUtilityButton
        ariaLabel="Start dictation"
        testId="spielwiese-playground-composer-dictation-button"
      >
        <Mic aria-hidden="true" className="size-4.5 shrink-0" />
      </ComposerUtilityButton>
      <Button
        aria-label="Run playground input"
        className="h-9 min-h-9 w-9 min-w-9 rounded-full bg-[#15181C] text-white hover:opacity-70 focus-visible:ring-1 focus-visible:ring-black/12 focus-visible:ring-offset-0 disabled:bg-[#E6E8EB] disabled:text-[#A7ADB4] disabled:opacity-100"
        data-testid="spielwiese-playground-submit-button"
        disabled={!canSubmit}
        size="icon"
        type="submit"
        variant="ghost"
      >
        <ArrowUp aria-hidden="true" className="size-4.5 shrink-0" />
      </Button>
    </div>
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
      className="sticky bottom-0 z-10 -mx-4 flex shrink-0 justify-center bg-transparent px-4 pt-2.5 pb-3"
      data-testid="spielwiese-playground-composer-shell"
    >
      <form
        className="flex w-full max-w-[32rem] items-center gap-1 rounded-[24px] border border-black/8 bg-transparent px-2.5 py-1.5 shadow-[0_8px_20px_rgba(15,23,42,0.05),0_1px_2px_rgba(15,23,42,0.04)]"
        data-testid="spielwiese-playground-composer-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) {
            onSubmit();
          }
        }}
      >
        <ComposerLeadingControl />
        <div
          className="flex min-w-0 flex-1 items-center overflow-x-hidden px-0.5"
          data-testid="spielwiese-playground-composer-primary"
        >
          <label className="sr-only" htmlFor="spielwiese-playground-input">
            Playground input
          </label>
          <Textarea
            className={playgroundComposerTextareaClassName}
            data-testid="spielwiese-playground-input"
            id="spielwiese-playground-input"
            placeholder="Ask anything"
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
        <ComposerTrailingControls canSubmit={canSubmit} />
      </form>
    </div>
  );
}
