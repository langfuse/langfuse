import React, { useCallback, useRef, useState } from "react";
import { Loader2, Sparkles, CornerDownLeft } from "lucide-react";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";
import { type ChartViewConfig } from "../types";
import { ASK_AI_SUGGESTIONS, parseAskAi } from "../lib/parseAskAi";

/**
 * Mocked "Ask AI → chart" affordance. Phase 2 replaces {@link parseAskAi} with a
 * `naturalLanguageFilters`-style LLM completion; the surface here is exactly
 * what that flow drives — type an ask, a short "thinking" beat, and the chart
 * reconfigures. View-only: it parses to a spec and hands it up via `onApply`;
 * the parent decides to switch to chart mode and apply it.
 */

const THINKING_MS = 650;

export const AskAiChartBar = React.memo(function AskAiChartBar({
  onApply,
  variant = "bar",
  className,
}: {
  onApply: (config: ChartViewConfig) => void;
  variant?: "bar" | "panel";
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [thinking, setThinking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const run = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length === 0 || thinking) return;
      setThinking(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        onApply(parseAskAi(trimmed));
        setThinking(false);
      }, THINKING_MS);
    },
    [onApply, thinking],
  );

  React.useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        variant === "panel" && "bg-muted/40 rounded-md border p-2.5",
        className,
      )}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(query);
        }}
        className="relative flex items-center gap-2"
      >
        <div className="relative flex-1">
          <Sparkles
            className={cn(
              "absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2",
              thinking ? "text-primary animate-pulse" : "text-muted-foreground",
            )}
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={thinking}
            placeholder="Ask AI to build a chart…"
            aria-label="Ask AI to build a chart"
            className="h-8 pr-8 pl-8 text-sm"
          />
          <CornerDownLeft className="text-muted-foreground/60 absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2" />
        </div>
        <Button type="submit" size="sm" disabled={thinking || !query.trim()}>
          {thinking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Ask"}
        </Button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {thinking ? (
          <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Loader2 className="h-3 w-3 animate-spin" />
            Building chart…
          </span>
        ) : (
          ASK_AI_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setQuery(s);
                run(s);
              }}
              className="border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-full border px-2.5 py-0.5 text-xs transition-colors"
            >
              {s}
            </button>
          ))
        )}
      </div>
    </div>
  );
});
