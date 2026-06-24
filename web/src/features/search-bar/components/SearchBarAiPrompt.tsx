// AI sub-mode for the search bar: a natural-language prompt that replaces the
// grammar composer when active (entered via Tab on an empty bar, or the
// "Ask AI" affordance). On submit it calls `searchBar.generateFilter`, applies
// the returned filters through the bar's normal setFilterState path
// (apply-immediately), and exits back to the grammar composer — which then
// re-derives the generated filters as editable pills.
//
// When opened with filters already applied, `currentQuery` carries the current
// bar query text. It is shown (so the user sees what's being refined) AND sent
// to the model, which REFINES it (add / change / remove) and returns the
// complete updated set.

import * as React from "react";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";

import { type FilterState } from "@langfuse/shared";
import { KeyboardShortcut } from "@/src/components/ui/keyboard-shortcut";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";

export function SearchBarAiPrompt({
  projectId,
  currentQuery,
  dataContext,
  onApply,
  onExit,
}: {
  projectId: string;
  /** Current bar query text, sent as refine context when filters already exist. */
  currentQuery?: string;
  /** Observed values + metadata keys + result count, so the model maps to the
   *  project's real columns/values instead of guessing. */
  dataContext?: string;
  /** Apply generated filters via the bar's setFilterState (apply-immediately). */
  onApply: (filters: FilterState) => void;
  /** Leave AI mode and restore the grammar composer. */
  onExit: () => void;
}) {
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  // Set on unmount (e.g. Back clicked mid-generation). `mutateAsync` keeps
  // running after unmount, so we check this before applying — otherwise a
  // generation the user cancelled would silently replace their filters when it
  // resolves a few seconds later.
  const cancelledRef = React.useRef(false);
  React.useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const refineContext = (currentQuery ?? "").trim();
  const refining = refineContext.length > 0;
  const placeholder = refining
    ? "Refine your filters — e.g. only errors, or drop the env filter"
    : "Describe the filters you want — e.g. slow production errors from today";

  const generateFilter = api.searchBar.generateFilter.useMutation();
  const pending = generateFilter.isPending;

  // Refocus after every request settles. `disabled={pending}` blurs the input
  // to <body> during the call; on a failed/empty generation (AI mode stays
  // open) Esc and typing would otherwise be dead until you re-click. Runs on
  // mount too (pending starts false). On success the component unmounts, so the
  // focus is a harmless no-op.
  React.useEffect(() => {
    if (!pending) inputRef.current?.focus();
  }, [pending]);

  const submit = async () => {
    const prompt = value.trim();
    if (prompt.length === 0 || pending) return;
    setError(null);
    try {
      const result = await generateFilter.mutateAsync({
        projectId,
        prompt,
        currentQuery: refining ? refineContext : undefined,
        dataContext,
      });
      // Cancelled mid-flight (Back clicked while generating): don't apply.
      if (cancelledRef.current) return;
      if (result.filters.length === 0) {
        setError("Couldn't build filters from that — try rephrasing.");
        return;
      }
      onApply(result.filters as FilterState);
      onExit();
    } catch {
      if (cancelledRef.current) return;
      // Never surface raw server messages: a TRPCClientError is an Error, so its
      // message could leak internal state, and the tRPC formatter masks 500s to
      // an unhelpful "we have been notified" string anyway. The auth/precondition
      // cases are unreachable behind the cloud + aiFeaturesEnabled gate. Show one
      // generic, actionable message instead.
      setError("Couldn't reach the AI service. Please try again.");
    }
  };

  return (
    <div className="relative w-full">
      <div
        className={cn(
          "border-input bg-background rounded-md border px-2 py-1.5",
          "focus-within:ring-ring focus-within:ring-1",
          error && "border-destructive focus-within:ring-destructive/40",
        )}
      >
        {/* Refine context: the filters being refined are shown here AND sent to
            the model, so what's applied is never hidden while you edit it. */}
        {refining && (
          <div
            // preventDefault so clicking the shown filter keeps the input focused
            // — it never drops you back to the grammar bar or loses your prompt.
            onMouseDown={(event) => event.preventDefault()}
            className="text-muted-foreground mb-1.5 flex min-w-0 items-center gap-1.5 pl-1 text-xs"
          >
            <span className="shrink-0">Refining</span>
            <code className="bg-muted text-foreground/80 min-w-0 truncate rounded px-1.5 py-0.5 font-mono text-[11px]">
              {refineContext}
            </code>
          </div>
        )}
        <div className="flex min-h-6 items-center gap-2">
          {/* Back affordance (Raycast-style) — clearer than a static icon that
              you're in a sub-mode you can leave. */}
          <button
            type="button"
            aria-label="Back to search"
            title="Back (Esc)"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onExit}
            className="text-muted-foreground hover:text-foreground hover:bg-accent -ml-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <input
            ref={inputRef}
            type="text"
            value={value}
            disabled={pending}
            placeholder={placeholder}
            aria-label="Ask AI to build filters"
            data-testid="search-bar-ai-input"
            spellCheck={false}
            autoComplete="off"
            // @tailwindcss/forms styles `input:focus` with a blue border + a 1px
            // ring box-shadow (the "blue box"). border-0 + focus:ring-0 drop both
            // (it's `:focus`, not `:focus-visible`), so the only focus indicator
            // is the container's subtle focus-within ring, matching the grammar bar.
            className="placeholder:text-muted-foreground min-w-0 flex-1 border-0 bg-transparent text-xs leading-6 outline-none focus:ring-0 focus:outline-none disabled:opacity-60"
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
            // No blur-to-exit: leaving AI mode is explicit (the back button or
            // Esc), so a stray click never drops you back to the bar or loses the
            // prompt you typed.
          />
          {pending ? (
            <span className="text-muted-foreground flex shrink-0 items-center gap-1.5 pr-1 text-xs">
              <Loader2
                className="h-3.5 w-3.5 animate-spin"
                aria-hidden="true"
              />
              Generating…
            </span>
          ) : (
            <div className="flex shrink-0 items-center gap-1.5">
              {value.trim().length > 0 && (
                <KeyboardShortcut title="Press Enter to generate">
                  ↵
                </KeyboardShortcut>
              )}
              <KeyboardShortcut>esc</KeyboardShortcut>
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
      </div>
      {error && (
        <div className="text-destructive mt-1 px-1 font-sans text-xs">
          {error}
        </div>
      )}
    </div>
  );
}
