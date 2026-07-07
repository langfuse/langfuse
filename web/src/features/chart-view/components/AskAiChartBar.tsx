import React, { useCallback, useState } from "react";
import { CornerDownLeft, Loader2, Sparkles } from "lucide-react";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";
import { api } from "@/src/utils/api";
import { type ChartViewConfig } from "../types";
import { ASK_AI_SUGGESTIONS, coerceConfig, DEFAULT_CONFIG } from "../vocab";

/**
 * "Ask AI → chart" for the production events view: natural language → a chart
 * spec via `chartView.generateChartConfig` (cloud-only / `aiFeaturesEnabled`,
 * enforced server-side). The returned spec is clamped through `coerceConfig`
 * and handed up via `onApply`; the parent applies it to the URL state. Only
 * mounted when AI is available, so it never shows a dead affordance.
 */
export const AskAiChartBar = React.memo(function AskAiChartBar({
  projectId,
  onApply,
}: {
  projectId: string;
  onApply: (config: ChartViewConfig) => void;
}) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = api.chartView.generateChartConfig.useMutation({
    onSuccess: (data) => {
      // The AI spec omits granularity (production pins auto); fill the rest of
      // the config from defaults so `coerceConfig` gets a complete spec.
      onApply(coerceConfig({ ...DEFAULT_CONFIG, ...data.config }));
    },
    onError: (e) => {
      setError(
        e.message || "Couldn't build a chart from that — try rephrasing.",
      );
    },
  });

  const run = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length === 0 || mutation.isPending) return;
      setError(null);
      mutation.mutate({ projectId, prompt: trimmed });
    },
    [mutation, projectId],
  );

  const thinking = mutation.isPending;

  return (
    <div className="bg-muted/40 flex flex-col gap-2 rounded-md border p-2.5">
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

      {error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : (
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
      )}
    </div>
  );
});
