import {
  DEFAULT_SIDEBAR_HIDDEN_ENVIRONMENTS,
  EvalTemplateType,
  type FilterState,
} from "@langfuse/shared";
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
import { ActivationConfirmationDialog } from "@/src/features/evals/v2/components/Rules/ActivationConfirmationDialog/ActivationConfirmationDialog";
import { RuleDialogFooter } from "@/src/features/evals/v2/components/Rules/RuleDialogFooter/RuleDialogFooter";
import { useActivationConfirmation } from "@/src/features/evals/v2/hooks/useActivationConfirmation";
import { createRuleSetupStore } from "@/src/features/evals/v2/stores/createRuleSetupStore";
import type { RuleEvaluatorOption } from "@/src/features/evals/v2/types/rules";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { api } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";

// Exclude Langfuse's own traffic by default, the same set the sidebar hides
// (DEFAULT_SIDEBAR_HIDDEN_ENVIRONMENTS): evaluator executions land in
// `langfuse-*` environments, so without this a new rule would evaluate its own
// output and every other evaluator's. Matched by prefix rather than enumerated
// so future internal environments are covered too.
const LANGFUSE_INTERNAL_ENVIRONMENT_PREFIX = "langfuse-";
const DEFAULT_RULE_FILTERS: FilterState = [
  {
    column: "environment",
    type: "string",
    operator: "does not contain",
    value: LANGFUSE_INTERNAL_ENVIRONMENT_PREFIX,
  },
  {
    column: "environment",
    type: "stringOptions",
    operator: "none of",
    value: DEFAULT_SIDEBAR_HIDDEN_ENVIRONMENTS.filter(
      (environment) =>
        !environment.startsWith(LANGFUSE_INTERNAL_ENVIRONMENT_PREFIX),
    ),
  },
];

export function CreateRuleDialogContent({
  projectId,
  open,
  onOpenChange,
  evaluatorOptions,
  initialEvaluator,
  evaluatorSearch,
  onEvaluatorSearchChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  evaluatorOptions: RuleEvaluatorOption[];
  initialEvaluator: RuleEvaluatorOption | undefined;
  evaluatorSearch: string;
  onEvaluatorSearchChange: (search: string) => void;
}) {
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const [ruleSetupStore] = useState(() =>
    createRuleSetupStore({
      name: "",
      filter: DEFAULT_RULE_FILTERS,
      sampling: 1,
      assignments: initialEvaluator
        ? [
            {
              evaluatorId: initialEvaluator.id,
              evaluatorName: initialEvaluator.name,
              defaultVariableMapping: initialEvaluator.defaultVariableMapping,
              variableMapping: null,
            },
          ]
        : [],
    }),
  );
  const activation = useActivationConfirmation({ projectId });
  const hasRequestedName = useRef(false);
  const suggestName = api.evalsV2.rules.suggestName.useMutation({
    onSuccess: (suggested) => {
      if (suggested && !ruleSetupStore.getState().name) {
        ruleSetupStore.getState().actions.setName(suggested);
      }
    },
  });
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
    showSuccessToast({
      title: "Rule created",
      description: `${rule.name} is active.`,
    });
    await Promise.all([
      utils.evalsV2.rules.list.invalidate({ projectId }),
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

  const requestActivation = async () => {
    const draft = ruleSetupStore.getState();
    const llmEvaluatorIds = draft.assignments
      .map(({ evaluatorId }) => evaluatorId)
      .filter(
        (evaluatorId) =>
          evaluatorOptions.find(({ id }) => id === evaluatorId)?.type ===
          EvalTemplateType.LLM_AS_JUDGE,
      );
    await activation.requestActivation({
      targets: llmEvaluatorIds.map((evaluatorId) => ({
        evaluatorId,
        evaluatorName:
          draft.assignments.find(
            (assignment) => assignment.evaluatorId === evaluatorId,
          )?.evaluatorName ?? "LLM evaluator",
        filter: draft.filter,
        sampling: draft.sampling,
      })),
      title: "Activate evaluation rule?",
      description:
        "Based on matching observations from the last seven days and the latest evaluator test calls:",
      confirmLabel: "Activate rule",
      onConfirm: async (sampling) => {
        if (sampling !== undefined) {
          ruleSetupStore.getState().actions.setSampling(sampling);
        }
        await create();
      },
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          size="xl"
          className="max-w-6xl"
          closeOnInteractionOutside
        >
          <DialogHeader>
            <DialogTitle>New rule</DialogTitle>
            <DialogDescription>
              Define what data is evaluated, attach evaluators, then name the
              rule.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <RuleSetup
              projectId={projectId}
              evaluatorOptions={evaluatorOptions}
              evaluatorSearch={evaluatorSearch}
              onEvaluatorSearchChange={onEvaluatorSearchChange}
              store={ruleSetupStore}
              isSuggestingName={suggestName.isPending}
              onNameStepOpenChange={(stepOpen) => {
                const state = ruleSetupStore.getState();
                if (stepOpen && !state.name && !hasRequestedName.current) {
                  hasRequestedName.current = true;
                  suggestName.mutate({
                    projectId,
                    filter: state.filter,
                    sampling: state.sampling,
                  });
                }
              }}
            />
          </DialogBody>
          <RuleDialogFooter
            ruleSetupStore={ruleSetupStore}
            activationPending={activation.estimate.status === "estimating"}
            mutationPending={createRule.isPending}
            isEditing={false}
            canEdit
            onCancel={() => onOpenChange(false)}
            onSave={() => requestActivation().catch(() => undefined)}
          />
        </DialogContent>
      </Dialog>
      <ActivationConfirmationDialog
        confirmation={activation.confirmation}
        estimate={activation.estimate}
        onOpenChange={activation.setOpen}
        onSamplingChange={activation.setSampling}
        onConfirm={() => activation.confirmActivation().catch(() => undefined)}
      />
    </>
  );
}
