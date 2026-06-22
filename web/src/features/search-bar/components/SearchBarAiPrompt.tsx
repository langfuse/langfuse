// AI sub-mode for the search bar: a natural-language prompt that replaces the
// grammar composer when active (entered via Tab on an empty bar, or the
// "Ask AI" affordance). On submit it calls `searchBar.generateFilter`, applies
// the returned filters through the bar's normal setFilterState path
// (apply-immediately), and exits back to the grammar composer — which then
// re-derives the generated filters as editable pills.

import * as React from "react";
import { ArrowRight, Loader2, WandSparkles } from "lucide-react";

import { type FilterState } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";

const PLACEHOLDER =
  "Describe the filters you want — e.g. slow production errors from today";

export function SearchBarAiPrompt({
  projectId,
  onApply,
  onExit,
}: {
  projectId: string;
  /** Apply generated filters via the bar's setFilterState (apply-immediately). */
  onApply: (filters: FilterState) => void;
  /** Leave AI mode and restore the grammar composer. */
  onExit: () => void;
}) {
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const generateFilter = api.searchBar.generateFilter.useMutation();
  const pending = generateFilter.isPending;

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async () => {
    const prompt = value.trim();
    if (prompt.length === 0 || pending) return;
    setError(null);
    try {
      const result = await generateFilter.mutateAsync({ projectId, prompt });
      if (result.filters.length === 0) {
        setError("Couldn't build filters from that — try rephrasing.");
        return;
      }
      onApply(result.filters as FilterState);
      onExit();
    } catch (err) {
      // The tRPC error formatter masks INTERNAL_SERVER_ERROR messages to a
      // generic "we have been notified" string, which reads like a Langfuse bug
      // rather than "retry". Show our own friendly copy for that (and any
      // codeless failure); surface the real message only for the informative
      // precondition/forbidden cases.
      const code = (err as { data?: { code?: string } } | null)?.data?.code;
      const hasUsefulMessage =
        err instanceof Error &&
        code !== undefined &&
        code !== "INTERNAL_SERVER_ERROR";
      setError(
        hasUsefulMessage
          ? (err as Error).message
          : "Couldn't reach the AI service. Please try again.",
      );
    }
  };

  return (
    <div className="relative w-full">
      <div
        className={cn(
          "border-input bg-background flex min-h-9 items-center gap-2 rounded-md border px-2 py-1.5",
          "focus-within:ring-ring focus-within:ring-1",
          error && "border-destructive focus-within:ring-destructive/40",
        )}
      >
        <WandSparkles
          className="text-muted-foreground h-4 w-4 shrink-0"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="text"
          value={value}
          disabled={pending}
          placeholder={PLACEHOLDER}
          aria-label="Ask AI to build filters"
          data-testid="search-bar-ai-input"
          spellCheck={false}
          autoComplete="off"
          className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-xs leading-6 outline-none disabled:opacity-60"
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              onExit();
            }
          }}
          // Clicking away from an empty prompt returns to the grammar composer;
          // a non-empty prompt stays so a stray blur doesn't lose typed text.
          onBlur={() => {
            if (!pending && value.trim().length === 0) onExit();
          }}
        />
        {pending ? (
          <span className="text-muted-foreground flex shrink-0 items-center gap-1.5 pr-1 text-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Generating…
          </span>
        ) : (
          <div className="flex shrink-0 items-center gap-1.5">
            {value.trim().length > 0 && (
              <kbd
                title="Press Enter to generate"
                className="border-border text-muted-foreground rounded border px-1 font-mono text-[10px] leading-none"
              >
                ↵
              </kbd>
            )}
            <kbd className="border-border text-muted-foreground rounded border px-1 font-mono text-[10px] leading-none">
              esc
            </kbd>
            <button
              type="button"
              aria-label="Generate filters"
              title="Generate filters (Enter)"
              data-testid="search-bar-ai-submit"
              disabled={value.trim().length === 0}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => submit()}
              className={cn(
                "text-muted-foreground hover:text-foreground hover:bg-accent inline-flex h-5 w-5 items-center justify-center rounded-sm",
                "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
              )}
            >
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      {error && (
        <div className="text-destructive mt-1 px-1 font-sans text-xs">
          {error}
        </div>
      )}
    </div>
  );
}
