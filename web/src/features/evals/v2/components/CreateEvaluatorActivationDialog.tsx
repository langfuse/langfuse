import { useState } from "react";

import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/src/components/ui/tabs";
import { ActivationCostEstimate } from "@/src/features/evals/v2/components/ActivationCostEstimate";
import { type FilterState } from "@langfuse/shared";

export type ActivationRulePreview = {
  id: string;
  name: string;
  filter: FilterState;
  sampling: number;
};

export function CreateEvaluatorActivationDialog({
  projectId,
  evaluatorId,
  setupFilter,
  setupSampling,
  testRunCostUsd,
  isCodeEvaluator,
  rulePreviews,
  sharedRuleCount = 0,
  open,
  loading,
  onOpenChange,
  onSave,
  onRuleSamplingChange,
}: {
  projectId: string;
  evaluatorId?: string;
  setupFilter: FilterState;
  setupSampling: number;
  testRunCostUsd: number | null;
  isCodeEvaluator: boolean;
  rulePreviews?: ActivationRulePreview[];
  sharedRuleCount?: number;
  open: boolean;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (runContinuously: boolean) => void;
  onRuleSamplingChange?: (ruleId: string, sampling: number) => void;
}) {
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const isRuleUpdate = rulePreviews !== undefined;
  const previews = rulePreviews ?? [
    {
      id: "setup-rule",
      name: "Evaluation rule",
      filter: setupFilter,
      sampling: setupSampling,
    },
  ];
  const selectedRule =
    previews.find((rule) => rule.id === selectedRuleId) ?? previews[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" closeOnInteractionOutside>
        <DialogHeader variant="action">
          <DialogTitle>
            {isRuleUpdate ? "Save rule changes?" : "Save and start running?"}
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="gap-4">
          <DialogDescription>
            {isRuleUpdate
              ? "You changed which observations this evaluator runs on. Save these changes to the rules it’s attached to?"
              : "Choose whether to run this evaluator on new observations matching the filters from step 1, or save it inactive and start it later."}
          </DialogDescription>

          {sharedRuleCount > 0 ? (
            <p className="text-muted-foreground text-xs">
              {sharedRuleCount === 1
                ? "One changed rule is shared. Updating it will also affect other evaluators attached to it."
                : `${sharedRuleCount} changed rules are shared. Updating them will also affect other evaluators attached to them.`}
            </p>
          ) : null}

          {selectedRule ? (
            <Tabs
              value={selectedRule.id}
              onValueChange={setSelectedRuleId}
              className="min-w-0"
            >
              {previews.length > 1 ? (
                <TabsList className="h-auto max-w-full justify-start gap-1 overflow-x-auto">
                  {previews.map((rule) => (
                    <TabsTrigger
                      key={rule.id}
                      value={rule.id}
                      className="max-w-48 font-normal"
                      title={rule.name}
                    >
                      <span className="truncate" title={rule.name}>
                        {rule.name}
                      </span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              ) : null}
              <TabsContent value={selectedRule.id} forceMount>
                <ActivationCostEstimate
                  projectId={projectId}
                  evaluatorId={evaluatorId}
                  filter={selectedRule.filter}
                  sampling={selectedRule.sampling}
                  testRunCostUsd={testRunCostUsd}
                  isCodeEvaluator={isCodeEvaluator}
                  enabled={open}
                  onSamplingChange={
                    onRuleSamplingChange
                      ? (sampling) =>
                          onRuleSamplingChange(selectedRule.id, sampling)
                      : undefined
                  }
                />
              </TabsContent>
            </Tabs>
          ) : null}
        </DialogBody>

        <DialogFooter variant="action">
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => onSave(false)}
          >
            {isRuleUpdate ? "Save evaluator only" : "Save only"}
          </Button>
          <Button type="button" loading={loading} onClick={() => onSave(true)}>
            {isRuleUpdate ? "Save evaluator & attached rules" : "Save & run"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
