import { type ActionTypes } from "@langfuse/shared";
import { useAvailableActionTypes } from "@/src/features/automations";
import { PagerDutyTestEventButtons } from "@/src/features/pagerduty";
import { useHasProjectAccess } from "@/src/features/rbac";
import {
  useChannelSelectorData,
  useSlackConnect,
  useSlackTestMessage,
} from "@/src/features/slack";
import { api, reportTrpcErrorWithoutToast } from "@/src/utils/api";
import { type SlackFieldsState } from "./components/SlackActionFields";
import { buildCreateMonitorAutomationInput } from "./helpers/buildCreateMonitorAutomationInput";
import { type MonitorAutomationFormValues } from "./helpers/monitorAutomationFormSchema";
import {
  NewMonitorAutomationDialog,
  type MonitorAutomationSubmitResult,
} from "./NewMonitorAutomationDialog";

const monitorActionTypes: readonly ActionTypes[] = [
  "SLACK",
  "WEBHOOK",
  "GITHUB_DISPATCH",
  "PAGERDUTY",
];

/** ConnectedNewMonitorAutomationDialog creates the monitor automation and feeds the dialog the project's Slack state. */
export function ConnectedNewMonitorAutomationDialog({
  projectId,
  lockedActionType,
  onCreated,
}: {
  projectId: string;
  lockedActionType?: ActionTypes;
  onCreated: (automation: CreatedMonitorAutomation) => void;
}) {
  const actionTypes = useAvailableActionTypes(monitorActionTypes);
  const slack = useSlackFieldsState(projectId);
  const createAutomation = useCreateMonitorAutomation();

  const submit = async (
    values: MonitorAutomationFormValues,
  ): Promise<MonitorAutomationSubmitResult> => {
    try {
      const result = await createAutomation.mutateAsync(
        buildCreateMonitorAutomationInput(projectId, values),
      );
      onCreated({
        automationId: result.automation.id,
        name: values.name.trim(),
        // GitHub dispatch also returns its token in `webhookSecret`.
        webhookSecret: webhookSigningSecret(
          values.actionType,
          result.webhookSecret,
        ),
      });
      return {};
    } catch (error) {
      return { error: rejectionMessage(error) };
    }
  };

  return (
    <NewMonitorAutomationDialog
      lockedActionType={lockedActionType}
      actionTypes={actionTypes}
      slack={slack}
      renderPagerDutyTestEvent={({ routingKey, region }) => (
        <PagerDutyTestEventButtons
          projectId={projectId}
          region={region}
          routingKey={routingKey || undefined}
          actionId={undefined}
        />
      )}
      isSubmitting={createAutomation.isPending}
      onSubmit={submit}
    />
  );
}

/** useSlackFieldsState resolves the project's Slack connection, channels, and connect/test actions. */
function useSlackFieldsState(projectId: string): SlackFieldsState {
  const canManageIntegration = useHasProjectAccess({
    projectId,
    scope: "integrations:CRUD",
  });
  const integration = api.slack.getIntegrationStatus.useQuery({ projectId });
  const isConnected = integration.data?.isConnected === true;
  const { canListChannels, ...channelSelector } = useChannelSelectorData(
    projectId,
    isConnected,
  );
  const { connect, connectError, isConnecting, canConnect } = useSlackConnect({
    projectId,
    shouldToast: false,
    onSuccess: () => integration.refetch(),
  });
  const { sendTestMessage, isPending: isTesting } = useSlackTestMessage({
    projectId,
    shouldToast: false,
  });

  if (integration.isPending) return { status: "loading" };
  if (!isConnected) {
    return {
      status: "disconnected",
      canManageIntegration,
      canConnect: canConnect && canManageIntegration,
      connectError,
      isConnecting,
      onConnect: connect,
    };
  }
  return {
    status: "connected",
    channelSelector: { ...channelSelector, disabled: !canListChannels },
    isTesting,
    onTestChannel: sendTestMessage,
  };
}

/** useCreateMonitorAutomation creates an automation and refreshes every automation list. */
function useCreateMonitorAutomation() {
  const utils = api.useUtils();
  return api.automations.createAutomation.useMutation({
    onSuccess: () => utils.automations.invalidate(),
    // The dialog shows rejections under the field they concern.
    onError: (error) => reportTrpcErrorWithoutToast(error, "automations"),
  });
}

/** rejectionMessage is the reason the server gave for refusing the automation. */
function rejectionMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "The automation could not be created. Try again.";
}

/** webhookSigningSecret keeps the returned secret only for webhooks, the one action whose secret is shown once. */
function webhookSigningSecret(
  actionType: ActionTypes,
  secret: string | undefined,
): string | undefined {
  if (actionType !== "WEBHOOK") return undefined;
  return secret;
}

/** CreatedMonitorAutomation is a just-created automation; `webhookSecret` is set only for webhooks. */
export type CreatedMonitorAutomation = {
  automationId: string;
  name: string;
  webhookSecret?: string;
};
