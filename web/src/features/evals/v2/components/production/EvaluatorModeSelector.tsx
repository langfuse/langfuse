import { Code2, Sparkles } from "lucide-react";
import { SiPython, SiTypescript } from "react-icons/si";

import {
  Tabs,
  AnimatedTabsList as TabsList,
  AnimatedTabsTrigger as TabsTrigger,
} from "@/src/components/ui/tabs";

export type EvaluatorTab = "llm" | "python" | "typescript";

/** Selects the evaluator implementation and, for code evaluators, language. */
export function EvaluatorModeSelector({
  value,
  onValueChange,
  disabled = false,
}: {
  value: EvaluatorTab;
  onValueChange: (value: EvaluatorTab) => void;
  disabled?: boolean;
}) {
  const isCodeMode = value !== "llm";

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>Run using</span>
      <Tabs
        value={isCodeMode ? "code" : "llm"}
        onValueChange={(mode) =>
          onValueChange(mode === "llm" ? "llm" : isCodeMode ? value : "python")
        }
      >
        <TabsList className="bg-background [&>span[aria-hidden]]:bg-muted border">
          <TabsTrigger value="llm" className="gap-1.5" disabled={disabled}>
            <Sparkles className="h-3.5 w-3.5" />
            LLM-as-a-judge
          </TabsTrigger>
          <TabsTrigger value="code" className="gap-1.5" disabled={disabled}>
            <Code2 className="h-3.5 w-3.5" />
            Code evaluator
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {isCodeMode ? (
        <>
          <span>written in</span>
          <Tabs
            value={value}
            onValueChange={(language) =>
              onValueChange(language as EvaluatorTab)
            }
          >
            <TabsList className="bg-background [&>span[aria-hidden]]:bg-muted border">
              <TabsTrigger
                value="python"
                className="gap-1.5"
                disabled={disabled}
              >
                <SiPython className="h-3.5 w-3.5" />
                Python
              </TabsTrigger>
              <TabsTrigger
                value="typescript"
                className="gap-1.5"
                disabled={disabled}
              >
                <SiTypescript className="h-3.5 w-3.5" />
                TypeScript
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </>
      ) : null}
    </div>
  );
}
