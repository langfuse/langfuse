import { ArrowLeft } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/src/components/ui/sheet";
import { EvaluatorDefinitionView } from "@/src/features/evals/v2/components/production/EvaluatorDefinitionView";
import type { EvaluatorVersion } from "./types";

export function EvaluatorVersionHistoryDetail({
  version,
  modelLabel,
  usesProjectDefaultModel,
  onBack,
}: {
  version: EvaluatorVersion;
  modelLabel: string;
  usesProjectDefaultModel: boolean;
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
          evaluatorType={version.type}
          sourceCode={version.sourceCode}
          sourceCodeLanguage={version.sourceCodeLanguage}
          prompt={version.prompt}
          modelLabel={modelLabel}
          usesProjectDefaultModel={usesProjectDefaultModel}
          outputDefinition={version.outputDefinition}
          mappings={[]}
          showMappings={false}
          showType={false}
        />
      </div>
    </>
  );
}
