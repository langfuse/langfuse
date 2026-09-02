import Link from "next/link";
import { ExternalLink, Plus } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import {
  EvaluatorAssignmentsEditor,
  type RuleEvaluatorOption,
  type RuleSetupStore,
} from "@/src/features/evals";

export function EvaluatorMappingStep({
  store,
  evaluatorOptions,
  isQueryLoading,
  isQueryError,
  queryErrorMessage,
  search,
  onSearchChange,
  sampleObject,
  createEvaluatorHref,
}: {
  store: RuleSetupStore;
  evaluatorOptions: RuleEvaluatorOption[];
  isQueryLoading: boolean;
  isQueryError: boolean;
  queryErrorMessage: string | undefined;
  search: string;
  onSearchChange: (value: string) => void;
  sampleObject: Record<string, unknown> | null;
  createEvaluatorHref: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isQueryLoading ? (
          <p className="text-muted-foreground text-sm">Loading evaluators...</p>
        ) : isQueryError ? (
          <Card>
            <CardContent className="text-destructive p-4 text-sm">
              Failed to load evaluators: {queryErrorMessage}
            </CardContent>
          </Card>
        ) : (
          <EvaluatorAssignmentsEditor
            evaluatorOptions={evaluatorOptions}
            store={store}
            search={search}
            onSearchChange={onSearchChange}
            sampleObject={sampleObject}
            costEstimates={[]}
            estimatingEvaluatorIds={[]}
            footerTrailing={null}
            emptyDescription="Attach an evaluator to score this selection."
            sourceUnavailableMessage="No observation is available to validate JSON paths."
          />
        )}
      </div>
      <Button variant="outline" size="default" className="h-9 w-full" asChild>
        <Link
          href={createEvaluatorHref}
          target="_blank"
          rel="noreferrer"
          aria-label="Create new Evaluator (opens in a new tab)"
        >
          <Plus className="mr-1 h-4 w-4" />
          Create new Evaluator
          <ExternalLink className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}
