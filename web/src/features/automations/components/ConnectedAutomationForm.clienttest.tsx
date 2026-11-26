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
    prompts: {
      filterOptions: {
        useQuery: () => ({ data: { labels: [], tags: [] }, isFetching: false }),
      },
    },
    skills: {
      filterOptions: {
        useQuery: () => ({ data: { labels: [], tags: [] }, isFetching: false }),
      },
    },
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

// Cloud-only: the Alert option in the event-source picker is gated on this.
vi.mock("@/src/features/organizations/hooks", () => ({
  useLangfuseCloudRegion: () => ({ isLangfuseCloud: true, region: "US" }),
}));

vi.mock("@/src/features/events/hooks/useReadPath", () => ({
  useReadPath: () => ({ isV4: true }),
}));

import { ConnectedAutomationForm } from "./ConnectedAutomationForm";

describe("ConnectedAutomationForm webhook API version", () => {
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
      <ConnectedAutomationForm
        projectId="p1"
        isEditing={true}
        prefill={{
          eventSource: TriggerEventSource.Monitor,
          actionType: "WEBHOOK",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Action type" }));
    fireEvent.click(await screen.findByRole("option", { name: "Slack" }));
    expect(screen.queryByRole("textbox", { name: "Webhook URL" })).toBeNull();

    fireEvent.click(screen.getByRole("combobox", { name: "Action type" }));
    fireEvent.click(await screen.findByRole("option", { name: "Webhook" }));

    fireEvent.change(screen.getByRole("textbox", { name: "Automation name" }), {
      target: { value: "My automation" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Webhook URL" }), {
      target: { value: "https://example.com/hook" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save automation/i }));

    await waitFor(() => {
      expect(createAutomationMutateAsync).toHaveBeenCalledTimes(1);
    });

    expect(createAutomationMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        eventSource: TriggerEventSource.Monitor,
        actionConfig: expect.objectContaining({
          type: "WEBHOOK",
          apiVersion: { monitor: "v1" },
        }),
      }),
    );
  });

  it("switching event source from prompt to monitor derives apiVersion monitor", async () => {
    render(
      <ConnectedAutomationForm
        projectId="p1"
        isEditing={true}
        prefill={{ actionType: "WEBHOOK" }}
      />,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Event source" }));
    fireEvent.click(await screen.findByRole("option", { name: "Alert" }));

    fireEvent.change(screen.getByRole("textbox", { name: "Automation name" }), {
      target: { value: "My automation" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Webhook URL" }), {
      target: { value: "https://example.com/hook" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save automation/i }));

    await waitFor(() => {
      expect(createAutomationMutateAsync).toHaveBeenCalledTimes(1);
    });

    expect(createAutomationMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        eventSource: TriggerEventSource.Monitor,
        actionConfig: expect.objectContaining({
          type: "WEBHOOK",
          apiVersion: { monitor: "v1" },
        }),
      }),
    );
  });
});
