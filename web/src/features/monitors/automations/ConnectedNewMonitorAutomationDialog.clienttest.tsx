import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { defaultMonitorAutomationFormValues } from "./helpers/monitorAutomationFormSchema";
import { ConnectedNewMonitorAutomationDialog } from "./ConnectedNewMonitorAutomationDialog";

/** submittedValues is what the stubbed dialog submits. */
let submittedValues = defaultMonitorAutomationFormValues("WEBHOOK", "Hook");

const mutateAsync = vi.fn();

vi.mock("@/src/utils/api", () => ({
  reportTrpcErrorWithoutToast: vi.fn(),
  api: {
    useUtils: () => ({ automations: { invalidate: vi.fn() } }),
    automations: {
      createAutomation: {
        useMutation: () => ({ mutateAsync, isPending: false }),
      },
    },
    slack: {
      getIntegrationStatus: {
        useQuery: () => ({ isPending: true, data: undefined }),
      },
    },
  },
}));
vi.mock("@/src/features/automations", () => ({
  useAvailableActionTypes: (types: string[]) => types,
}));
vi.mock("@/src/features/pagerduty", () => ({
  usePagerDutyTestEvent: () => ({}),
}));
vi.mock("@/src/features/rbac", () => ({ useHasProjectAccess: () => true }));
vi.mock("@/src/features/slack", () => ({
  useChannelSelectorData: () => ({ canListChannels: true }),
  useSlackConnect: () => ({ connect: vi.fn(), canConnect: true }),
  useSlackTestMessage: () => ({ sendTestMessage: vi.fn() }),
}));
/** submitResult is what the dialog's onSubmit resolved to. */
let submitResult: unknown;

vi.mock("./components/NewMonitorAutomationDialog", () => ({
  NewMonitorAutomationDialog: ({
    onSubmit,
  }: {
    onSubmit: (values: typeof submittedValues) => Promise<unknown>;
  }) => (
    <button
      onClick={async () => {
        submitResult = await onSubmit(submittedValues);
      }}
    >
      create
    </button>
  ),
}));

describe("ConnectedNewMonitorAutomationDialog", () => {
  it("passes on a webhook's signing secret for its once-only display", async () => {
    submittedValues = {
      ...defaultMonitorAutomationFormValues("WEBHOOK", "Hook"),
      webhook: { url: "example.com", headers: [] },
    };
    mutateAsync.mockResolvedValue({
      automation: { id: "auto-1" },
      webhookSecret: "lf-whsec_1",
    });
    const onCreated = vi.fn();
    render(
      <ConnectedNewMonitorAutomationDialog
        projectId="p1"
        onCreated={onCreated}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "create" }));

    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith({
        automationId: "auto-1",
        name: "Hook",
        webhookSecret: "lf-whsec_1",
      }),
    );
  });

  it("never shows a GitHub dispatch token as a webhook secret", async () => {
    submittedValues = {
      ...defaultMonitorAutomationFormValues("GITHUB_DISPATCH", "Deploy"),
      githubDispatch: {
        url: "api.github.com/repos/o/r/dispatches",
        eventType: "langfuse-alert",
        githubToken: "ghp_token",
      },
    };
    mutateAsync.mockResolvedValue({
      automation: { id: "auto-2" },
      webhookSecret: "ghp_token",
    });
    const onCreated = vi.fn();
    render(
      <ConnectedNewMonitorAutomationDialog
        projectId="p1"
        onCreated={onCreated}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "create" }));

    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith({
        automationId: "auto-2",
        name: "Deploy",
        webhookSecret: undefined,
      }),
    );
  });

  it("hands a server rejection back to the form instead of reporting a creation", async () => {
    submittedValues = {
      ...defaultMonitorAutomationFormValues("WEBHOOK", "Hook"),
      webhook: { url: "kjhkjhkj.com", headers: [] },
    };
    mutateAsync.mockRejectedValue(
      new Error("Invalid webhook URL: DNS lookup failed for kjhkjhkj.com"),
    );
    const onCreated = vi.fn();
    render(
      <ConnectedNewMonitorAutomationDialog
        projectId="p1"
        onCreated={onCreated}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "create" }));

    await waitFor(() =>
      expect(submitResult).toEqual({
        error: "Invalid webhook URL: DNS lookup failed for kjhkjhkj.com",
      }),
    );
    expect(onCreated).not.toHaveBeenCalled();
  });
});
