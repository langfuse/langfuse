import { ArrowUp, Eye, Square } from "@langfuse/icons";

import { KeyboardShortcut } from "@/src/components/design-system/KeyboardShortcut/KeyboardShortcut";
import { cn } from "@/src/utils/tailwind";

type StageChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: (() => void) | null;
  isResponding: boolean;
  blockedReason: string | null;
  placeholder: string;
  /** Shown once the page has been sent: later turns still carry it. */
  attachedContextLabel: string | null;
};

export function StageChatComposer({
  value,
  onChange,
  onSend,
  onStop,
  isResponding,
  blockedReason,
  placeholder,
  attachedContextLabel,
}: StageChatComposerProps) {
  const canSend = value.trim().length > 0 && !isResponding && !blockedReason;

  return (
    <div className="px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6 md:pb-6">
      <form
        className="border-border bg-background focus-within:border-ring mx-auto flex w-full max-w-3xl flex-col gap-1 rounded-2xl border p-2 shadow-sm transition-colors"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSend) {
            onSend();
          }
        }}
      >
        {blockedReason ? (
          <p className="text-muted-foreground px-2 pt-1 text-xs">
            {blockedReason}
          </p>
        ) : null}
        <textarea
          data-stage-composer-input
          value={value}
          rows={1}
          placeholder={placeholder}
          aria-label="Message the assistant"
          onChange={(event) => {
            onChange(event.target.value);
          }}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              if (canSend) {
                onSend();
              }
            }
          }}
          // 16px keeps iOS from zooming the page when the field takes focus.
          className="placeholder:text-muted-foreground field-sizing-content max-h-48 min-h-10 w-full resize-none bg-transparent px-2 py-1.5 text-base outline-hidden md:text-sm"
        />
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            {attachedContextLabel ? (
              <span
                className="border-border text-muted-foreground flex max-w-full min-w-0 items-center gap-1.5 truncate rounded-full border px-2 py-0.5 text-xs"
                title={attachedContextLabel}
              >
                <Eye size="sm" color="muted" aria-hidden />
                <span className="truncate" title={attachedContextLabel}>
                  {attachedContextLabel}
                </span>
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-muted-foreground hidden items-center gap-1 text-xs md:flex">
              <KeyboardShortcut variant="subtle" keys={["Enter"]} /> to send
            </span>
            {isResponding && onStop ? (
              <button
                type="button"
                onClick={onStop}
                aria-label="Stop responding"
                className="bg-foreground text-background focus-visible:ring-ring flex size-9 items-center justify-center rounded-full transition-opacity focus-visible:ring-2 focus-visible:outline-hidden md:size-8"
              >
                <Square size="sm" color="inherit" aria-hidden />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSend}
                aria-label="Send message"
                className={cn(
                  "bg-primary text-primary-foreground focus-visible:ring-ring flex size-9 items-center justify-center rounded-full transition-opacity focus-visible:ring-2 focus-visible:outline-hidden md:size-8",
                  !canSend && "opacity-40",
                )}
              >
                <ArrowUp size="base" color="inherit" aria-hidden />
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
