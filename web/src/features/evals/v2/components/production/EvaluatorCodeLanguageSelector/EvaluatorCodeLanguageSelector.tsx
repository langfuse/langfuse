import { SiPython, SiTypescript } from "react-icons/si";

import {
  Tabs,
  AnimatedTabsList as TabsList,
  AnimatedTabsTrigger as TabsTrigger,
} from "@/src/components/ui/tabs";

export type EvaluatorCodeLanguage = "python" | "typescript";

/** Selects the runtime language for a code evaluator. */
export function EvaluatorCodeLanguageSelector({
  value,
  onValueChange,
  disabled = false,
}: {
  value: EvaluatorCodeLanguage;
  onValueChange: (value: EvaluatorCodeLanguage) => void;
  disabled?: boolean;
}) {
  return (
    <Tabs
      value={value}
      onValueChange={(language) =>
        onValueChange(language as EvaluatorCodeLanguage)
      }
    >
      <TabsList className="bg-background [&>span[aria-hidden]]:bg-muted border">
        <TabsTrigger
          value="python"
          className="gap-1.5 leading-none"
          disabled={disabled}
        >
          <SiPython className="h-3.5 w-3.5 shrink-0" />
          Python
        </TabsTrigger>
        <TabsTrigger
          value="typescript"
          className="gap-1.5 leading-none"
          disabled={disabled}
        >
          <SiTypescript className="h-3.5 w-3.5 shrink-0" />
          TypeScript
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
