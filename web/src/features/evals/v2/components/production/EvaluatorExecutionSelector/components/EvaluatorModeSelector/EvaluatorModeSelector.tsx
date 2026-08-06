import { Code2, Sparkles } from "lucide-react";

import {
  Tabs,
  AnimatedTabsList as TabsList,
  AnimatedTabsTrigger as TabsTrigger,
} from "@/src/components/ui/tabs";
export type EvaluatorMode = "llm" | "code";

/** Selects the evaluator implementation. */
export function EvaluatorModeSelector({
  value,
  onValueChange,
  disabled = false,
}: {
  value: EvaluatorMode;
  onValueChange: (value: EvaluatorMode) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>Run using</span>
      <Tabs
        value={value}
        onValueChange={(mode) => onValueChange(mode as EvaluatorMode)}
      >
        <TabsList className="bg-background [&>span[aria-hidden]]:bg-muted border">
          <TabsTrigger
            value="llm"
            className="gap-1.5 leading-none"
            disabled={disabled}
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            LLM-as-a-judge
          </TabsTrigger>
          <TabsTrigger
            value="code"
            className="gap-1.5 leading-none"
            disabled={disabled}
          >
            <Code2 className="h-3.5 w-3.5 shrink-0" />
            Code evaluator
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
