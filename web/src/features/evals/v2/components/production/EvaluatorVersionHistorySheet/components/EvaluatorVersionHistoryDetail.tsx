import { ArrowLeft } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/src/components/ui/sheet";
import { EvaluatorDefinitionView } from "./EvaluatorDefinitionView";
import type { EvaluatorVersion } from "../types";

export function EvaluatorVersionHistoryDetail({
  version,
  selectedModel,
  defaultModel,
  onBack,
}: {
  version: EvaluatorVersion;
  selectedModel: { provider: string; model: string } | null;
  defaultModel: { provider: string; model: string } | null;
  onBack: () => void;
}) {
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-fit px-2"
        onClick={onBack}
      >
        <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
        All versions
      </Button>
      <SheetHeader>
        <SheetTitle>Version {version.version}</SheetTitle>
        <SheetDescription>
          Saved {version.createdAt.toLocaleString()}. This definition is
          read-only.
        </SheetDescription>
      </SheetHeader>
      <div className="pb-6">
        <EvaluatorDefinitionView
          definition={
            version.type === "CODE"
              ? {
                  type: "CODE",
                  sourceCode: version.sourceCode,
                  sourceCodeLanguage: version.sourceCodeLanguage,
                }
              : {
                  type: "LLM_AS_JUDGE",
                  prompt: version.prompt,
                  selectedModel,
                  defaultModel,
                  outputDefinition: version.outputDefinition,
                  variableMappings: { state: "hidden" },
                }
          }
        />
      </div>
    </>
  );
}
