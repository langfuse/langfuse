import { showSuccessToast } from "@/src/features/notifications";
import type { EvalTargetObject, FilterState } from "@langfuse/shared";
import { useRef, useState } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { RuleSetup } from "@/src/features/evals/v2/components/Rules/RuleSetup/RuleSetup";
import { RuleDialogFooter } from "@/src/features/evals/v2/components/Rules/RuleDialogFooter/RuleDialogFooter";
import { createRuleSetupStore } from "@/src/features/evals/v2/stores/createRuleSetupStore";
import type {
  RuleDraft,
  RuleEvaluatorOption,
} from "@/src/features/evals/v2/types/rules";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { api } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useProject } from "@/src/features/projects/hooks";
import { prepareNameForSave } from "@/src/features/evals/v2/fns/prepareNameForSave";
import { resolveInitialRuleFilters } from "./resolveInitialRuleFilters";

export function CreateRuleDialogContent({
  projectId,
  open,
  onOpenChange,
  evaluatorOptions,
  initialEvaluator,
  initialDraft,
  initialFilter,
  targetObject,
  evaluatorSearch,
  successNotification,
  onEvaluatorSearchChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  evaluatorOptions: RuleEvaluatorOption[];
  initialEvaluator: RuleEvaluatorOption | undefined;
  initialDraft: RuleDraft | undefined;
  initialFilter: FilterState | undefined;
  targetObject?: Extract<EvalTargetObject, "event" | "experiment">;
  evaluatorSearch: string;
  successNotification: "toast" | "none";
  onEvaluatorSearchChange: (search: string) => void;
}) {
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const { organization } = useProject(projectId);
  const nameAIAssistanceAvailable =
    isLangfuseCloud && Boolean(organization?.aiFeaturesEnabled);
  const [ruleSetupStore] = useState(() =>
    createRuleSetupStore({
      name: initialDraft?.name ?? "",
      filter: initialDraft?.filter ?? resolveInitialRuleFilters(initialFilter),
      sampling: initialDraft?.sampling ?? 1,
      assignments:
        initialDraft?.assignments ??
        (initialEvaluator
          ? [
              {
                evaluatorId: initialEvaluator.id,
                evaluatorName: initialEvaluator.name,
                evaluatorType: initialEvaluator.type,
                defaultVariableMapping: initialEvaluator.defaultVariableMapping,
                variableMapping: initialEvaluator.initialVariableMapping,
              },
            ]
          : []),
    }),
  );
  const hasRequestedName = useRef(false);
  const suggestName = api.evalsV2.rules.suggestName.useMutation({
    onError: trpcErrorToast,
  });

  const requestNameSuggestion = async () => {
    if (!nameAIAssistanceAvailable) return null;
    hasRequestedName.current = true;
    const state = ruleSetupStore.getState();
    const suggested = await suggestName.mutateAsync({
      projectId,
      filter: state.filter,
      sampling: state.sampling,
    });
    const name = suggested?.trim() || null;
    if (name) state.actions.setName(name);
    return name;
  };
  const createRule = api.evalsV2.rules.create.useMutation({
    onError: trpcErrorToast,
  });

  const create = async () => {
    const draft = ruleSetupStore.getState();
    const rule = await createRule.mutateAsync({
      projectId,
      name: draft.name.trim(),
      filter: draft.filter,
      sampling: draft.sampling,
      enabled: true,
      ...(targetObject ? { targetObject } : {}),
      evaluatorAssignments: draft.assignments.map((assignment) => ({
        evaluatorId: assignment.evaluatorId,
        variableMapping: assignment.variableMapping,
      })),
    });
    capture("evaluation_rules:create", {
      assignmentCount: draft.assignments.length,
      filterCount: draft.filter.length,
      samplingPercent: Math.round(draft.sampling * 100),
      isEnabled: true,
    });
    if (successNotification === "toast") {
      showSuccessToast({
        title: "Rule created",
        description: `${rule.name} is active.`,
      });
    }
    await Promise.all([
      utils.evalsV2.rules.list.invalidate({ projectId }),
      utils.evalsV2.rules.filterOptions.invalidate({ projectId }),
      utils.evalsV2.list.invalidate({ projectId }),
      ...draft.assignments.map(({ evaluatorId }) =>
        utils.evalsV2.rules.listRulesForEvaluator.invalidate({
          projectId,
          evaluatorId,
        }),
      ),
    ]);
    onOpenChange(false);
  };

  const requestCreate = async () => {
    const draft = ruleSetupStore.getState();
    const name = await prepareNameForSave({
      currentName: draft.name,
      generateName: nameAIAssistanceAvailable ? requestNameSuggestion : null,
      setName: draft.actions.setName,
    });
    if (!name) return;
    await create();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="max-w-6xl" closeOnInteractionOutside>
        <DialogHeader>
          <DialogTitle>New rule</DialogTitle>
          <DialogDescription>
            Select which incoming observations should trigger evaluators.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <RuleSetup
            projectId={projectId}
            evaluatorOptions={evaluatorOptions}
            evaluatorSearch={evaluatorSearch}
            onEvaluatorSearchChange={onEvaluatorSearchChange}
            store={ruleSetupStore}
            nameAIAssistance={
              !nameAIAssistanceAvailable
                ? { state: "unavailable" }
                : suggestName.isPending
                  ? { state: "generating" }
                  : {
                      state: "idle",
                      onGenerate: () =>
                        requestNameSuggestion().catch(() => undefined),
                    }
            }
            onNameStepOpenChange={(stepOpen) => {
              const state = ruleSetupStore.getState();
              if (
                nameAIAssistanceAvailable &&
                stepOpen &&
                !state.name &&
                !hasRequestedName.current
              ) {
                requestNameSuggestion().catch(() => undefined);
              }
            }}
          />
        </DialogBody>
        <RuleDialogFooter
          ruleSetupStore={ruleSetupStore}
          mutationPending={createRule.isPending}
          nameGenerationPending={suggestName.isPending}
          isEditing={false}
          canEdit
          nameAIAssistanceAvailable={nameAIAssistanceAvailable}
          onCancel={() => onOpenChange(false)}
          onSave={() => requestCreate().catch(() => undefined)}
        />
      </DialogContent>
    </Dialog>
  );
}
