import { useHasProjectAccess } from "@/src/features/rbac";
import { EvalTargetObject, EvalTemplateType } from "@langfuse/shared";
import { Link2, Plus, Unlink } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";
import { useDebounce } from "@/src/hooks/useDebounce";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { PopoverTrigger } from "@/src/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/src/components/ui/sheet";
import { Skeleton } from "@/src/components/ui/skeleton";
import { ActivationConfirmationDialog } from "@/src/features/evals/v2/components/Rules/ActivationConfirmationDialog/ActivationConfirmationDialog";
import { CreateRuleDialog } from "@/src/features/evals/v2/components/Rules/CreateRuleDialog/CreateRuleDialog";
import { EvaluationRulePicker } from "@/src/features/evals/v2/components/Rules/EvaluationRulePicker/EvaluationRulePicker";
import { useActivationConfirmation } from "@/src/features/evals/v2/hooks/useActivationConfirmation";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { api } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import { cn } from "@/src/utils/tailwind";
import { prepareModernRuleVariableMapping } from "@/src/features/evals/v2/fns/variableMapping/prepareModernRuleVariableMapping";
import { getRuleNavigationUrl } from "@/src/features/evals/v2/utils/ruleNavigation";
import { requiresLegacyMigrationAction } from "@/src/features/evals/utils/typeHelpers";
import { V4MigrationBadgeContent } from "@/src/features/v4-migration/V4MigrationBadgeContent";
import { RuleRelationshipButton } from "@/src/features/evals/v2/components/Rules/EvaluatorRuleRelationships/RuleRelationshipButton";

function keepSheetOpenForRelationshipOverlay(
  event: Event & { preventDefault: () => void },
) {
  if (
    event.target instanceof Element &&
    event.target.closest('[data-layer="modal"], [data-layer="popover"]')
  ) {
    event.preventDefault();
  }
}

export function EvaluatorRuleRelationships({
  projectId,
  evaluatorId,
  evaluatorName,
  evaluatorType,
  evaluatorDefaultVariableMapping,
}: {
  projectId: string;
  evaluatorId: string;
  evaluatorName: string;
  evaluatorType: EvalTemplateType;
  evaluatorDefaultVariableMapping: unknown;
}) {
  const [open, setOpen] = useState(false);
  const assignments = api.evalsV2.rules.listRulesForEvaluator.useQuery({
    projectId,
    evaluatorId,
  });

  return (
    <>
      <RuleRelationshipButton
        count={assignments.data?.length ?? 0}
        shouldCallAttention={
          !assignments.isPending && assignments.data?.length === 0
        }
        onClick={() => setOpen(true)}
      />
      <EvaluatorRuleRelationshipsSheet
        projectId={projectId}
        evaluatorId={evaluatorId}
        evaluatorName={evaluatorName}
        evaluatorType={evaluatorType}
        evaluatorDefaultVariableMapping={evaluatorDefaultVariableMapping}
        source="evaluator_detail"
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

function EvaluatorRuleRelationshipsSheet({
  projectId,
  evaluatorId,
  evaluatorName,
  evaluatorType,
  evaluatorDefaultVariableMapping,
  source,
  open,
  onOpenChange,
}: {
  projectId: string;
  evaluatorId: string;
  evaluatorName: string;
  evaluatorType: EvalTemplateType;
  evaluatorDefaultVariableMapping: unknown;
  source: "evaluator_detail" | "evaluator_overview";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const preparedEvaluatorMapping = prepareModernRuleVariableMapping(
    evaluatorDefaultVariableMapping,
    evaluatorType,
  );
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [ruleSearch, setRuleSearch] = useState("");
  const [ruleSearchQuery, setRuleSearchQuery] = useState("");
  const debouncedRuleSearch = useDebounce(setRuleSearchQuery, 300, false);
  const [createOpen, setCreateOpen] = useState(false);
  const activationConfirmation = useActivationConfirmation({ projectId });
  const isEstimating = activationConfirmation.estimate.status === "estimating";
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "evaluationRule:CUD",
  });
  const assignments = api.evalsV2.rules.listRulesForEvaluator.useQuery(
    { projectId, evaluatorId },
    { enabled: open },
  );
  const rules = api.evalsV2.rules.list.useQuery(
    {
      projectId,
      page: 1,
      limit: 100,
      search: ruleSearchQuery.trim() || undefined,
      targetObjects: [EvalTargetObject.EVENT, EvalTargetObject.EXPERIMENT],
    },
    { enabled: open && pickerOpen },
  );
  const invalidate = () =>
    Promise.all([
      utils.evalsV2.rules.listRulesForEvaluator.invalidate({
        projectId,
        evaluatorId,
      }),
      utils.evalsV2.rules.list.invalidate({ projectId }),
      utils.evalsV2.list.invalidate({ projectId }),
    ]);
  const attach = api.evalsV2.rules.attach.useMutation({
    onError: trpcErrorToast,
    onSuccess: async () => {
      capture("evaluation_rules:attach_evaluator", {
        evaluatorCount: 1,
        source,
      });
      setPickerOpen(false);
      await invalidate();
    },
  });
  const detach = api.evalsV2.rules.detach.useMutation({
    onError: trpcErrorToast,
    onSuccess: async () => {
      capture("evaluation_rules:detach_evaluator", {
        evaluatorCount: 1,
        source,
      });
      await invalidate();
    },
  });
  const attachedRuleIds = new Set(
    (assignments.data ?? []).map(({ evaluationRule }) => evaluationRule.id),
  );
  const assignmentCount = assignments.data?.length ?? 0;

  return (
    <>
      <Sheet open={open} modal={false} onOpenChange={onOpenChange}>
        <SheetContent
          className="flex flex-col gap-5 overflow-y-auto sm:max-w-2xl"
          onPointerDownOutside={keepSheetOpenForRelationshipOverlay}
          onInteractOutside={keepSheetOpenForRelationshipOverlay}
          onFocusOutside={keepSheetOpenForRelationshipOverlay}
        >
          <SheetHeader>
            <SheetTitle>Rules</SheetTitle>
            <SheetDescription>
              {assignments.isPending
                ? "Loading attached rules…"
                : `This evaluator is used by ${assignmentCount} ${assignmentCount === 1 ? "rule" : "rules"}. Attach it to a rule to run the evaluator on incoming observations.`}
            </SheetDescription>
          </SheetHeader>

          {assignments.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="space-y-3">
              {assignmentCount > 0 ? (
                <ul className="divide-y rounded-md border">
                  {(assignments.data ?? []).map(({ evaluationRule }) => (
                    <li
                      key={evaluationRule.id}
                      className="flex min-w-0 items-center gap-2 px-3 py-2"
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
                        title={evaluationRule.name}
                        onClick={() =>
                          router.push(
                            getRuleNavigationUrl({
                              projectId,
                              ruleId: evaluationRule.id,
                              targetObject: evaluationRule.targetObject,
                              enabled: evaluationRule.enabled,
                            }),
                          )
                        }
                      >
                        {evaluationRule.name}
                      </button>
                      <Badge
                        variant={
                          evaluationRule.enabled ? "default" : "secondary"
                        }
                        className={cn(
                          "shrink-0",
                          evaluationRule.enabled &&
                            "bg-light-green text-dark-green hover:bg-light-green",
                        )}
                      >
                        {evaluationRule.enabled ? "Active" : "Inactive"}
                      </Badge>
                      {requiresLegacyMigrationAction({
                        targetObject: evaluationRule.targetObject,
                        status: evaluationRule.enabled ? "ACTIVE" : "INACTIVE",
                        timeScope: evaluationRule.timeScope,
                      }) ? (
                        <V4MigrationBadgeContent
                          onClick={() => {
                            capture(
                              "v4_migration:update_required_badge_clicked",
                              { scope: "single" },
                            );
                            router.push(
                              getRuleNavigationUrl({
                                projectId,
                                ruleId: evaluationRule.id,
                                targetObject: evaluationRule.targetObject,
                                enabled: evaluationRule.enabled,
                              }),
                            );
                          }}
                          title="Upgrade now"
                          showChevron={false}
                          compact
                        />
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-2"
                        disabled={!hasWriteAccess || detach.isPending}
                        onClick={() =>
                          detach.mutate({
                            projectId,
                            ruleId: evaluationRule.id,
                            evaluatorId,
                          })
                        }
                      >
                        <Unlink className="h-3.5 w-3.5" />
                        Disconnect
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}

              <EvaluationRulePicker
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                search={ruleSearch}
                onSearchChange={(value) => {
                  setRuleSearch(value);
                  debouncedRuleSearch(value);
                }}
                loading={rules.isPending || attach.isPending || isEstimating}
                disabledRules={(rules.data?.rules ?? [])
                  .filter((rule) => attachedRuleIds.has(rule.id))
                  .map((rule) => ({
                    rule,
                    reason: "This evaluator is already attached.",
                  }))}
                availableRules={(rules.data?.rules ?? []).filter(
                  (rule) => !attachedRuleIds.has(rule.id),
                )}
                onSelectAvailableRule={(rule) => {
                  activationConfirmation
                    .requestActivation({
                      targets:
                        rule.enabled &&
                        evaluatorType === EvalTemplateType.LLM_AS_JUDGE
                          ? [
                              {
                                evaluatorId,
                                evaluatorName,
                                filter: rule.filter,
                                sampling: rule.sampling,
                              },
                            ]
                          : [],
                      title: "Attach evaluator to rule",
                      description:
                        "This rule is active. Based on matching observations and the latest evaluator trace from the last seven days:",
                      confirmLabel: "Attach evaluator to rule",
                      onConfirm: async () => {
                        await attach.mutateAsync({
                          projectId,
                          ruleId: rule.id,
                          evaluatorId,
                          variableMapping:
                            preparedEvaluatorMapping.initialVariableMapping,
                        });
                      },
                    })
                    .catch(() => undefined);
                }}
                onCreateRule={() => {
                  setPickerOpen(false);
                  setCreateOpen(true);
                }}
                align="start"
              >
                {() => (
                  <PopoverTrigger asChild>
                    {assignmentCount === 0 ? (
                      <button
                        type="button"
                        className="border-border hover:bg-muted/50 focus-visible:ring-ring flex w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed px-4 py-6 text-center transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!hasWriteAccess}
                      >
                        <span className="flex items-center gap-2 text-sm font-bold">
                          <Link2 className="h-4 w-4" />
                          Attach to rule
                        </span>
                        <span className="text-muted-foreground text-sm font-normal">
                          Choose a rule that should run this evaluator.
                        </span>
                      </button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-foreground hover:text-foreground h-auto w-full justify-start px-0 py-0 text-xs underline-offset-4 hover:bg-transparent hover:underline"
                        disabled={!hasWriteAccess}
                      >
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        Attach another rule
                      </Button>
                    )}
                  </PopoverTrigger>
                )}
              </EvaluationRulePicker>
            </div>
          )}
        </SheetContent>
      </Sheet>
      {createOpen ? (
        <CreateRuleDialog
          projectId={projectId}
          open
          initialEvaluator={{
            id: evaluatorId,
            name: evaluatorName,
            type: evaluatorType,
            ...preparedEvaluatorMapping,
          }}
          onOpenChange={setCreateOpen}
          successNotification="toast"
        />
      ) : null}
      <ActivationConfirmationDialog
        confirmation={activationConfirmation.confirmation}
        estimate={activationConfirmation.estimate}
        onOpenChange={activationConfirmation.setOpen}
        onConfirm={() =>
          activationConfirmation.confirmActivation().catch(() => undefined)
        }
      />
    </>
  );
}
