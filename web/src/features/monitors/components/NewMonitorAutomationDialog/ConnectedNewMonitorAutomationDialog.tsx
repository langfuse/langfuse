import { type ActionTypes } from "@langfuse/shared";
import { useAvailableActionTypes } from "@/src/features/automations";
import { PagerDutyTestEventButtons } from "@/src/features/pagerduty";
import { useHasProjectAccess } from "@/src/features/rbac";
import {
  useSlackChannels,
  useSlackConnect,
  useSlackTestMessage,
} from "@/src/features/slack";
import { useSupportDrawer } from "@/src/features/support-chat";
import { api } from "@/src/utils/api";
import { type SlackFieldsState } from "./components/SlackActionFields";
import { buildCreateMonitorAutomationInput } from "./fns/buildCreateMonitorAutomationInput";
import { type MonitorAutomationFormValues } from "./fns/monitorAutomationFormSchema";
import { NewMonitorAutomationDialog } from "./NewMonitorAutomationDialog";

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
  onClose,
  onCreated,
}: {
  projectId: string;
  lockedActionType?: ActionTypes;
  onClose: () => void;
  onCreated: (automation: CreatedMonitorAutomation) => void;
}) {
  const actionTypes = useAvailableActionTypes(monitorActionTypes);
  const slack = useSlackFieldsState(projectId);
  const { setOpen: setSupportDrawerOpen } = useSupportDrawer();
  const createAutomation = useCreateMonitorAutomation();

  const submit = async (values: MonitorAutomationFormValues) => {
    try {
      const result = await createAutomation.mutateAsync(
        buildCreateMonitorAutomationInput(projectId, values),
      );
      onCreated({
        automationId: result.automation.id,
        name: values.name.trim(),
        webhookSecret: result.webhookSecret,
      });
    } catch {
      // The mutation cache toasts the error; the dialog stays open to retry.
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
      onRequestAutomation={() => {
        onClose();
        setSupportDrawerOpen(true);
      }}
      onSubmit={submit}
    />
  );
}

/** useSlackFieldsState resolves the project's Slack connection, channels, and connect/test actions. */
function useSlackFieldsState(projectId: string): SlackFieldsState {
  const canListChannels = useHasProjectAccess({
    projectId,
    scope: "automations:CUD",
  });
  const integration = api.slack.getIntegrationStatus.useQuery({ projectId });
  const isConnected = integration.data?.isConnected === true;
  const { channelsData, isLoadingChannels } = useSlackChannels(
    projectId,
    canListChannels && isConnected,
  );
  const { connect, isConnecting, canConnect } = useSlackConnect({
    projectId,
    onSuccess: () => integration.refetch(),
  });
  const { sendTestMessage, isPending: isTesting } = useSlackTestMessage({
    projectId,
  });

  if (integration.isPending) return { status: "loading" };
  if (!isConnected) {
    return {
      status: "disconnected",
      canConnect,
      isConnecting,
      onConnect: connect,
    };
  }
  return {
    status: "connected",
    channels: channelsData?.channels ?? [],
    isLoadingChannels,
    isTesting,
    onTestChannel: sendTestMessage,
  };
}

/** useCreateMonitorAutomation creates an automation and refreshes every automation list. */
function useCreateMonitorAutomation() {
  const utils = api.useUtils();
  return api.automations.createAutomation.useMutation({
    onSuccess: () => utils.automations.invalidate(),
  });
}

/** CreatedMonitorAutomation is a just-created automation; `webhookSecret` is set only for webhooks. */
export type CreatedMonitorAutomation = {
  automationId: string;
  name: string;
  webhookSecret?: string;
};
