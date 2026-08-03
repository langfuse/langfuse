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
  },
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ asPath: "/", push: vi.fn() }),
}));

vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => true,
}));

vi.mock("@/src/features/feature-flags/hooks/useIsFeatureEnabled", () => ({
  default: () => true,
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

    // comboboxes: [0] eventSource, [1] actionType, [2] webhook apiVersion.
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
});
