import { EvalTemplateTypeEnum } from "@langfuse/shared";
import { formatDistanceToNowStrict } from "date-fns";
import { RotateCcw } from "lucide-react";

import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { CollapsibleCard } from "@/src/features/evals/v2/components/CollapsibleCard/CollapsibleCard";
import {
  EvaluatorDefinitionView,
  type EvaluatorDefinition,
} from "../EvaluatorDefinitionView/EvaluatorDefinitionView";
import type { JudgeModel } from "@/src/features/evals/v2/judgeModel";
import type { EvaluatorVersion } from "../../types";

function toEvaluatorDefinition(
  version: EvaluatorVersion,
  defaultModel: JudgeModel | null,
): EvaluatorDefinition {
  if (version.type === EvalTemplateTypeEnum.CODE) {
    return {
      type: EvalTemplateTypeEnum.CODE,
      sourceCode: version.sourceCode,
      sourceCodeLanguage: version.sourceCodeLanguage,
    };
  }

  return {
    type: EvalTemplateTypeEnum.LLM_AS_JUDGE,
    promptMessages: version.promptMessages!,
    // Each version pins the model it ran with; the project default only fills
    // in when it never had an explicit one.
    selectedModel:
      version.provider && version.model
        ? { provider: version.provider, model: version.model }
        : null,
    defaultModel,
    outputDefinition: version.outputDefinition,
    variableMappings: { state: "hidden" },
  };
}

export function EvaluatorVersionHistoryList({
  versions,
  currentVersionId,
  defaultModel,
  expandedVersionId,
  onExpandedVersionChange,
  onRestoreVersion,
  isLoading,
}: {
  versions: EvaluatorVersion[];
  currentVersionId: string;
  defaultModel: JudgeModel | null;
  /** The version whose definition is open; null collapses them all. */
  expandedVersionId: string | null;
  onExpandedVersionChange: (versionId: string | null) => void;
  onRestoreVersion: (version: EvaluatorVersion) => void;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No saved versions found.</p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {versions.map((version) => {
        const author =
          version.createdByUser?.name ?? version.createdByUser?.email ?? "API";
        const saved = formatDistanceToNowStrict(version.createdAt, {
          addSuffix: true,
        });

        return (
          <CollapsibleCard
            key={version.id}
            open={expandedVersionId === version.id}
            onOpenChange={(open) =>
              onExpandedVersionChange(open ? version.id : null)
            }
            disabled={false}
            triggerTitle={
              expandedVersionId === version.id
                ? `Collapse version ${version.version}`
                : `Show the definition saved as version ${version.version}`
            }
            header={
              <>
                <span className="shrink-0 font-bold">
                  Version {version.version}
                </span>
                {version.id === currentVersionId ? (
                  <Badge variant="success" className="shrink-0 px-2">
                    Current
                  </Badge>
                ) : null}
                <span className="text-muted-foreground flex min-w-0 shrink-0 items-center gap-1 text-xs">
                  <span
                    className="min-w-0 truncate"
                    title={`Created by ${author}`}
                  >
                    {author}
                  </span>
                  <span aria-hidden>·</span>
                  <span
                    className="shrink-0"
                    title={`Saved ${version.createdAt.toLocaleString()}`}
                  >
                    {saved}
                  </span>
                </span>
              </>
            }
            actions={
              version.id === currentVersionId ? null : (
                <span className="flex shrink-0 items-center pr-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Restore version ${version.version}`}
                    title={`Restore version ${version.version}`}
                    onClick={() => onRestoreVersion(version)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                </span>
              )
            }
          >
            <div className="p-3">
              <EvaluatorDefinitionView
                definition={toEvaluatorDefinition(version, defaultModel)}
              />
            </div>
          </CollapsibleCard>
        );
      })}
    </div>
  );
}
