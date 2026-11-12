import {
  TopicsTargetObject,
  type FilterState,
  type ObservationVariableMapping,
} from "@langfuse/shared";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { RuleFilterPills } from "@/src/features/evals/v2/components/Rules/RuleFilterPills/RuleFilterPills";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";

/** After a trace-scope save: offer a trace rule with the panel's filters and mapping. */
export function TraceRuleSavedDialog({
  projectId,
  evaluator,
  filter,
  variableMapping,
  onDismiss,
  onFinish,
}: {
  projectId: string;
  evaluator: { id: string; name: string };
  filter: FilterState;
  variableMapping: ObservationVariableMapping[];
  onDismiss: () => Promise<void>;
  onFinish: () => Promise<void>;
}) {
  const utils = api.useUtils();
  const createRule = api.evalsV2.rules.createTraceTranscript.useMutation({
    onError: (error) => trpcErrorToast(error, "evaluator_rule.create"),
  });

  const create = async () => {
    const rule = await createRule.mutateAsync({
      projectId,
      name: `${evaluator.name} on traces`,
      targetObject: TopicsTargetObject,
      filter,
      sampling: 1,
      enabled: true,
      evaluatorAssignments: [{ evaluatorId: evaluator.id, variableMapping }],
    });
    showSuccessToast({
      operation: "evaluation_rule.create",
      title: "Trace rule created",
      description: `${rule.name} evaluates new matching traces.`,
    });
    await utils.evalsV2.invalidate();
    await onFinish();
  };

  return (
    <DialogController
      initialState={() => true}
      onDismiss={() => {
        onDismiss().catch(() => undefined);
      }}
      renderDialog={() => (
        <Dialog
          title="Evaluator saved"
          closeLabel="Skip"
          requireExplicitClose={createRule.isPending}
          actions={[
            {
              label: "Create trace rule",
              loading: createRule.isPending,
              onClick: () => {
                create().catch(() => undefined);
              },
            },
          ]}
        >
          <Dialog.Body>
            <div className="flex flex-col gap-3 text-sm">
              <p>
                Run it on every new trace that matches these filters. Each
                variable reads the trace transcript the way you mapped it.
              </p>
              {filter.length > 0 ? (
                <RuleFilterPills filter={filter} />
              ) : (
                <p className="text-muted-foreground">All traces</p>
              )}
            </div>
          </Dialog.Body>
        </Dialog>
      )}
    >
      {() => null}
    </DialogController>
  );
}
