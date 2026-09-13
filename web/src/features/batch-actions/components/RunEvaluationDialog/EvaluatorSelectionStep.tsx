import { useMemo } from "react";
import {
  observationVariableMappingList,
  type ObservationVariableMapping,
} from "@langfuse/shared";
import { type RouterOutputs } from "@/src/utils/api";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { Input } from "@/src/components/ui/input";
import { EvaluatorPromptPreview } from "./EvaluatorPromptPreview";
import { renderPromptPreviewFromObservation } from "./utils";
import { Eye, X } from "lucide-react";

export type BatchEvaluator = {
  id: string;
  scoreName: string;
  variableMapping: ObservationVariableMapping[];
  prompt: string | null;
};
type EventPreview = RouterOutputs["events"]["batchIO"][number];

type EvaluatorSelectionStepProps = {
  eligibleEvaluators: BatchEvaluator[];
  selectedEvaluators: BatchEvaluator[];
  isQueryLoading: boolean;
  isQueryError: boolean;
  queryErrorMessage: string | undefined;
  previewObservation: EventPreview | undefined;
  isPreviewLoading: boolean;
  selectedEvaluatorIds: string[];
  evaluatorSearchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onToggleEvaluator: (evaluatorId: string) => void;
};

export function EvaluatorSelectionStep(props: EvaluatorSelectionStepProps) {
  const {
    eligibleEvaluators,
    selectedEvaluators,
    isQueryLoading,
    isQueryError,
    queryErrorMessage,
    previewObservation,
    isPreviewLoading,
    selectedEvaluatorIds,
    evaluatorSearchQuery,
    onSearchQueryChange,
    onToggleEvaluator,
  } = props;

  const filteredEvaluators = useMemo(() => {
    const normalizedSearch = evaluatorSearchQuery.trim().toLowerCase();
    const filtered = normalizedSearch
      ? eligibleEvaluators.filter((evaluator) =>
          evaluator.scoreName.toLowerCase().includes(normalizedSearch),
        )
      : eligibleEvaluators;

    return [...filtered].sort((a, b) =>
      a.scoreName.localeCompare(b.scoreName, undefined, {
        sensitivity: "base",
      }),
    );
  }, [eligibleEvaluators, evaluatorSearchQuery]);

  const getPromptPreview = (evaluator: BatchEvaluator) => {
    if (isPreviewLoading) {
      return "Loading preview...";
    }

    if (!previewObservation) {
      return "Preview unavailable for the current selection.";
    }

    const mappingResult = observationVariableMappingList.safeParse(
      evaluator.variableMapping,
    );

    if (!mappingResult.success) {
      return "Evaluator mapping is not valid for observation preview.";
    }

    return renderPromptPreviewFromObservation({
      prompt: evaluator.prompt,
      variableMapping: mappingResult.data,
      observation: previewObservation,
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex min-h-0 flex-1 flex-col">
        {isQueryLoading ? (
          <p className="text-muted-foreground text-sm">Loading evaluators...</p>
        ) : isQueryError ? (
          <Card>
            <CardContent className="text-destructive p-4 text-sm">
              Failed to load evaluators: {queryErrorMessage}
            </CardContent>
          </Card>
        ) : eligibleEvaluators.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground p-4 text-sm">
              No evaluators found. Create a new evaluator and it will appear
              here.
            </CardContent>
          </Card>
        ) : (
          <div className="flex h-full min-h-0 flex-col gap-2">
            <div className="relative">
              <Input
                autoFocus
                className="pr-10"
                placeholder="Search evaluators..."
                value={evaluatorSearchQuery}
                onChange={(event) =>
                  onSearchQueryChange(event.currentTarget.value)
                }
              />
              {evaluatorSearchQuery.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-1/2 right-1.5 h-7 w-7 -translate-y-1/2"
                  onClick={() => onSearchQueryChange("")}
                  aria-label="Clear evaluator search"
                >
                  <X className="h-3 w-3" />
                </Button>
              ) : null}
            </div>

            <div className="px-1 pb-1">
              <div className="flex min-h-6 flex-wrap items-center gap-2">
                {selectedEvaluators.length > 0 ? (
                  selectedEvaluators.map((evaluator) => (
                    <EvaluatorPromptPreview
                      key={evaluator.id}
                      previewContent={getPromptPreview(evaluator)}
                      trigger={
                        <div>
                          <Badge
                            variant="secondary"
                            className="flex items-center gap-1 pr-1"
                          >
                            <span>{evaluator.scoreName}</span>
                            <button
                              type="button"
                              aria-label={`Remove ${evaluator.scoreName}`}
                              className="hover:bg-muted rounded p-0.5"
                              onClick={() => onToggleEvaluator(evaluator.id)}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        </div>
                      }
                    />
                  ))
                ) : (
                  <p className="text-muted-foreground text-xs">
                    No evaluators selected
                  </p>
                )}
              </div>
            </div>

            {filteredEvaluators.length === 0 ? (
              <div className="flex min-h-0 flex-1 items-center justify-center rounded-md border">
                <p className="text-muted-foreground p-4 text-sm">
                  No evaluators match your search.
                </p>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
                {filteredEvaluators.map((item, index, array) => (
                  <div key={item.id}>
                    <div
                      className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 px-2 py-1.5 transition-colors"
                      onClick={() => onToggleEvaluator(item.id)}
                    >
                      <p
                        className="min-w-0 flex-1 truncate text-sm font-bold"
                        title={item.scoreName}
                      >
                        {item.scoreName}
                      </p>
                      <EvaluatorPromptPreview
                        previewContent={getPromptPreview(item)}
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="h-7 w-7"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                            onClick={(event) => event.stopPropagation()}
                            aria-label={`Preview ${item.scoreName}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        }
                      />
                      <span className="mr-1">
                        <Checkbox
                          checked={selectedEvaluatorIds.includes(item.id)}
                          aria-label={`Select ${item.scoreName}`}
                          onClick={(event) => event.stopPropagation()}
                          onCheckedChange={() => onToggleEvaluator(item.id)}
                        />
                      </span>
                    </div>
                    {index < array.length - 1 ? (
                      <div className="border-border/50 border-b" />
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
