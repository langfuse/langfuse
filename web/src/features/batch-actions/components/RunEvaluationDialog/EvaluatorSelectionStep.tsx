import { useMemo } from "react";
import { observationVariableMappingList } from "@langfuse/shared";
import { type RouterOutputs } from "@/src/utils/api";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Checkbox } from "@/src/components/ui/checkbox";
import { Input } from "@/src/components/ui/input";
import { EvaluatorPromptPreview } from "./EvaluatorPromptPreview";
import { renderPromptPreviewFromObservation } from "./utils";
import { Eye, Plus, X } from "lucide-react";

type Evaluator = RouterOutputs["evals"]["jobConfigsByTarget"][number];
type ObservationPreview = RouterOutputs["observations"]["byId"];

type EvaluatorSelectionStepProps = {
  eligibleEvaluators: Evaluator[];
  selectedEvaluators: Evaluator[];
  isQueryLoading: boolean;
  isQueryError: boolean;
  queryErrorMessage: string | undefined;
  previewObservation: ObservationPreview | undefined;
  isPreviewLoading: boolean;
  selectedEvaluatorIds: string[];
  evaluatorSearchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onToggleEvaluator: (evaluatorId: string) => void;
  onCreateEvaluator: () => void;
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
    onCreateEvaluator,
  } = props;

  const filteredEvaluators = useMemo(() => {
    const normalizedSearch = evaluatorSearchQuery.trim().toLowerCase();
    const filtered = normalizedSearch
      ? eligibleEvaluators.filter((evaluator) => {
          const templateName = evaluator.evalTemplate?.name ?? "";

          return (
            evaluator.scoreName.toLowerCase().includes(normalizedSearch) ||
            templateName.toLowerCase().includes(normalizedSearch)
          );
        })
      : eligibleEvaluators;

    return [...filtered].sort((a, b) =>
      a.scoreName.localeCompare(b.scoreName, undefined, {
        sensitivity: "base",
      }),
    );
  }, [eligibleEvaluators, evaluatorSearchQuery]);

  const getPromptPreview = (evaluator: Evaluator) => {
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
      prompt: evaluator.evalTemplate?.prompt,
      variableMapping: mappingResult.data,
      observation: previewObservation,
    });
  };

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="min-h-0 flex-1">
        {isQueryLoading ? (
          <p className="text-sm text-muted-foreground">Loading evaluators...</p>
        ) : isQueryError ? (
          <Card>
            <CardContent className="p-4 text-sm text-destructive">
              Failed to load evaluators: {queryErrorMessage}
            </CardContent>
          </Card>
        ) : eligibleEvaluators.length === 0 ? (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              No observation-scoped evaluators found. Create a new
              observation-scoped evaluator and it will appear here.
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
                  className="absolute right-1.5 top-1/2 h-7 w-7 -translate-y-1/2"
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
                              className="rounded p-0.5 hover:bg-muted"
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
                  <p className="text-xs text-muted-foreground">
                    No evaluators selected
                  </p>
                )}
              </div>
            </div>

            {filteredEvaluators.length === 0 ? (
              <div className="flex min-h-0 flex-1 items-center justify-center rounded-md border">
                <p className="p-4 text-sm text-muted-foreground">
                  No evaluators match your search.
                </p>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
                {filteredEvaluators.map((item, index, array) => (
                  <div key={item.id}>
                    <div
                      className="flex cursor-pointer items-center gap-2 px-2 py-1.5 transition-colors hover:bg-muted/50"
                      onClick={() => onToggleEvaluator(item.id)}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {item.scoreName}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          Template:{" "}
                          {item.evalTemplate?.name ?? "Deleted template"}
                        </p>
                      </div>
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
                      <Checkbox
                        checked={selectedEvaluatorIds.includes(item.id)}
                        aria-label={`Select ${item.scoreName}`}
                        onClick={(event) => event.stopPropagation()}
                        onCheckedChange={() => onToggleEvaluator(item.id)}
                        className="mr-1"
                      />
                    </div>
                    {index < array.length - 1 ? (
                      <div className="border-b border-border/50" />
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <Button
        variant="outline"
        size="default"
        className="h-9 w-full"
        onClick={onCreateEvaluator}
      >
        <Plus className="mr-1 h-4 w-4" />
        Create new Evaluator
      </Button>
    </div>
  );
}
