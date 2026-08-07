import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TriggerEventSource } from "@langfuse/shared";

const createAutomationMutateAsync = vi.fn().mockResolvedValue({
  automation: { id: "auto-1" },
  webhookSecret: "secret",
});

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({ automations: { invalidate: vi.fn() } }),
    automations: {
      createAutomation: {
        useMutation: () => ({ mutateAsync: createAutomationMutateAsync }),
      },
      updateAutomation: {
        useMutation: () => ({ mutateAsync: vi.fn() }),
      },
      regenerateWebhookSecret: {
        useMutation: () => ({ mutateAsync: vi.fn() }),
      },
    },
    slack: {
      getIntegrationStatus: {
        useQuery: () => ({ data: undefined }),
      },
    },
    // Pulled in by the prompt-source filter builder.
    projects: { byId: { useQuery: () => ({ data: undefined }) } },
    naturalLanguageFilters: {
      createCompletion: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    },
  },
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: undefined, status: "unauthenticated" }),
}));

vi.mock("next/router", () => ({
  // query.projectId is read by the prompt-source filter builder.
  useRouter: () => ({
    asPath: "/",
    push: vi.fn(),
    query: { projectId: "p1" },
  }),
}));

vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => true,
}));

vi.mock("@/src/features/feature-flags/hooks/useIsFeatureEnabled", () => ({
  default: () => true,
}));

// Cloud-only: the Monitor option in the event-source picker is gated on this.
vi.mock("@/src/features/organizations/hooks", () => ({
  useLangfuseCloudRegion: () => ({ isLangfuseCloud: true, region: "US" }),
}));

import { AutomationForm } from "./automationForm";

describe("AutomationForm handleActionTypeChange", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  });

  beforeEach(() => {
    createAutomationMutateAsync.mockClear();
  });

  it("monitor-source trigger: switching action type away and back to WEBHOOK keeps apiVersion monitor", async () => {
    render(
      <AutomationForm
        projectId="p1"
        isEditing={true}
        prefill={{
          eventSource: TriggerEventSource.Monitor,
          actionType: "WEBHOOK",
        }}
      />,
    );

    // comboboxes: [0] eventSource, [1] actionType.
    fireEvent.click(screen.getAllByRole("combobox")[1]);
    fireEvent.click(await screen.findByRole("option", { name: "Slack" }));

    fireEvent.click(screen.getAllByRole("combobox")[1]);
    fireEvent.click(await screen.findByRole("option", { name: "Webhook" }));

    fireEvent.change(screen.getByPlaceholderText(/automation name/i), {
      target: { value: "My automation" },
    });
    fireEvent.change(screen.getByPlaceholderText(/https/i), {
      target: { value: "https://example.com/hook" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save automation/i }));

    await waitFor(() => {
      expect(createAutomationMutateAsync).toHaveBeenCalledTimes(1);
    });

    const payload = createAutomationMutateAsync.mock.calls[0][0];
    expect(payload.actionConfig.apiVersion).toEqual({ monitor: "v1" });
  });

  it("switching event source from prompt to monitor derives apiVersion monitor", async () => {
    render(
      <AutomationForm
        projectId="p1"
        isEditing={true}
        prefill={{ actionType: "WEBHOOK" }}
      />,
    );

    // comboboxes: [0] eventSource, [1] actionType.
    fireEvent.click(screen.getAllByRole("combobox")[0]);
    fireEvent.click(await screen.findByRole("option", { name: "Monitor" }));

    fireEvent.change(screen.getByPlaceholderText(/automation name/i), {
      target: { value: "My automation" },
    });
    fireEvent.change(screen.getByPlaceholderText(/https/i), {
      target: { value: "https://example.com/hook" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save automation/i }));

    await waitFor(() => {
      expect(createAutomationMutateAsync).toHaveBeenCalledTimes(1);
    });

    const payload = createAutomationMutateAsync.mock.calls[0][0];
    expect(payload.actionConfig.apiVersion).toEqual({ monitor: "v1" });
  });

  it("does not render an API version control for webhook actions", () => {
    render(
      <AutomationForm
        projectId="p1"
        isEditing={true}
        prefill={{ actionType: "WEBHOOK" }}
      />,
    );

    expect(screen.queryByText("API Version")).toBeNull();
    expect(screen.queryByText("Select API version")).toBeNull();
  });
});
