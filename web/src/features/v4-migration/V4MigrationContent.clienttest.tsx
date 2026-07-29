import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  V4MigrationDetailsContent,
  V4MigrationHeaderContent,
} from "./V4MigrationContent";
import { type MigrationCountState } from "./migrationData";

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(),
  setAgentOpen: vi.fn(),
  submitAgentMessage: vi.fn(),
  upgradePlan: {
    canUseAssistant: true,
    mode: "evals-ready" as const,
    showAssistantButton: true,
    assistantPrompt: "eval-upgrade-prompt",
  },
  migrationData: {
    sdk: {
      status: "latest" as const,
      sdkUsageSeries: [],
      upgradeRequiredCount: 0,
    },
    evals: { status: "loaded", count: 0 } as MigrationCountState,
    apis: { status: "loaded", count: 1 } as MigrationCountState,
    exports: { status: "loaded", count: 3 } as MigrationCountState,
    apiUsage: [{ endpoint: "GET /api/public/traces", count: 42 }],
    legacyIntegrations: ["PostHog", "Mixpanel", "Blob Storage"],
  },
  canToggleV4: true,
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    query: { projectId: "project-1" },
    push: mocks.routerPush,
  }),
}));

vi.mock("@/src/features/support-chat/SupportDrawerProvider", () => ({
  useSupportDrawer: () => ({ openWithMode: vi.fn() }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/features/projects/hooks", () => ({
  useProject: () => ({ organization: { id: "org-1" } }),
}));

vi.mock("@/src/features/v4-migration/hooks/useV4MigrationData", () => ({
  useProjectV4MigrationData: () => mocks.migrationData,
  useProjectV4SdkData: () => mocks.migrationData.sdk,
  useProjectV4EvalData: () => mocks.migrationData.evals,
}));

// The plan hook queries tRPC internally; mock it so tests need no provider.
vi.mock("@/src/features/v4-migration/useV4UpgradeAssistantSupport", () => ({
  V4_CODING_AGENT_PROMPT: "coding-agent-prompt",
  useEvalUpgradeAssistantPlan: () => mocks.upgradePlan,
}));

vi.mock("@/src/features/in-app-agent/components/InAppAiAgentProvider", () => ({
  useCanUseInAppAgent: () => true,
  useInAppAiAgent: () => ({
    setOpen: mocks.setAgentOpen,
    submit: mocks.submitAgentMessage,
  }),
}));

// The toggle row pulls in session + tRPC state via useV4Beta; stub it so the
// content tests need no SessionProvider or tRPC client.
vi.mock("@/src/features/events/components/V4SidebarToggle", () => ({
  V4PreviewToggleRow: () => null,
}));

// The details content reads canToggleV4 to gate the toggle section's copy.
vi.mock("@/src/features/events/hooks/useV4Beta", () => ({
  useV4Beta: () => ({ canToggleV4: mocks.canToggleV4 }),
}));

vi.mock("@/src/components/ui/collapsible", () => ({
  Collapsible: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CollapsibleTrigger: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
  ),
  CollapsibleContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

describe("V4MigrationDetailsContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.routerPush.mockResolvedValue(true);
    mocks.submitAgentMessage.mockResolvedValue(undefined);
    mocks.migrationData.evals = { status: "loaded", count: 0 };
    mocks.canToggleV4 = true;
    mocks.migrationData.apis = { status: "loaded", count: 1 };
    mocks.migrationData.exports = { status: "loaded", count: 3 };
    mocks.migrationData.apiUsage = [
      { endpoint: "GET /api/public/traces", count: 42 },
    ];
    mocks.migrationData.legacyIntegrations = [
      "PostHog",
      "Mixpanel",
      "Blob Storage",
    ];
  });

  it("uses deprecated terminology and links to the migration guides", () => {
    render(<V4MigrationDetailsContent projectId="project-1" />);

    expect(screen.getByText("Deprecated APIs")).toBeInTheDocument();
    expect(screen.getByText("Deprecated Integrations")).toBeInTheDocument();
    expect(screen.queryByText("Legacy APIs")).not.toBeInTheDocument();
    expect(screen.queryByText("Legacy Integrations")).not.toBeInTheDocument();

    expect(
      screen.getByRole("link", { name: "GET /api/public/traces" }),
    ).toHaveAttribute(
      "href",
      "https://langfuse.com/faq/all/deprecated-api-migration",
    );

    const expectedIntegrationGuides = {
      PostHog:
        "https://langfuse.com/integrations/analytics/posthog#migrate-export-source",
      Mixpanel:
        "https://langfuse.com/integrations/analytics/mixpanel#migrate-export-source",
      "Blob Storage":
        "https://langfuse.com/docs/api-and-data-platform/features/export-to-blob-storage#upgrade-path",
    };

    for (const [name, href] of Object.entries(expectedIntegrationGuides)) {
      const settingsLink = screen.getByRole("link", { name });
      expect(settingsLink).toHaveAttribute(
        "href",
        "/project/project-1/settings/integrations",
      );
      expect(
        within(settingsLink.parentElement!).getByRole("link", {
          name: "Migration guide",
        }),
      ).toHaveAttribute("href", href);
    }
  });

  it("uses deprecated terminology in the empty states", () => {
    mocks.migrationData.apis = { status: "loaded", count: 0 };
    mocks.migrationData.exports = { status: "loaded", count: 0 };
    mocks.migrationData.apiUsage = [];
    mocks.migrationData.legacyIntegrations = [];

    render(<V4MigrationDetailsContent projectId="project-1" />);

    expect(
      screen.getByText(/No deprecated public API usage detected/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No deprecated integration exports detected."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No deprecated evals detected."),
    ).toBeInTheDocument();
  });

  it("shows the preview-toggle section only when the session can toggle v4", () => {
    const { unmount } = render(
      <V4MigrationDetailsContent projectId="project-1" />,
    );
    expect(screen.getByText("Want to review first?")).toBeInTheDocument();
    expect(
      screen.getByText(/Use this toggle to compare both views/),
    ).toBeInTheDocument();
    unmount();

    mocks.canToggleV4 = false;
    render(<V4MigrationDetailsContent projectId="project-1" />);
    expect(screen.queryByText("Want to review first?")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Use this toggle to compare both views/),
    ).not.toBeInTheDocument();
  });

  it("navigates to evals when migrating with the assistant", async () => {
    mocks.migrationData.evals = { status: "loaded", count: 1 };

    render(<V4MigrationDetailsContent projectId="project-1" />);

    fireEvent.click(
      screen.getByRole("button", { name: "Migrate with assistant" }),
    );

    await waitFor(() => {
      expect(mocks.routerPush).toHaveBeenCalledWith("/project/project-1/evals");
    });
    expect(mocks.setAgentOpen).toHaveBeenCalledWith(true);
    expect(mocks.submitAgentMessage).toHaveBeenCalledWith(
      "eval-upgrade-prompt",
      { newConversation: true },
    );
  });

  it("opens the assistant when navigation to evals is interrupted", async () => {
    mocks.migrationData.evals = { status: "loaded", count: 1 };
    mocks.routerPush.mockRejectedValueOnce(
      new Error("Abort fetching component for route"),
    );

    render(<V4MigrationDetailsContent projectId="project-1" />);

    fireEvent.click(
      screen.getByRole("button", { name: "Migrate with assistant" }),
    );

    await waitFor(() => {
      expect(mocks.setAgentOpen).toHaveBeenCalledWith(true);
    });
    expect(mocks.submitAgentMessage).toHaveBeenCalledWith(
      "eval-upgrade-prompt",
      { newConversation: true },
    );
  });
});

describe("V4MigrationHeaderContent", () => {
  beforeEach(() => {
    mocks.migrationData.evals = { status: "loaded", count: 0 };
    mocks.migrationData.apis = { status: "loaded", count: 1 };
    mocks.migrationData.exports = { status: "loaded", count: 3 };
  });

  it("claims the project needs migrating while checks report action needed", () => {
    render(<V4MigrationHeaderContent projectId="project-1" />);
    expect(
      screen.getByText(/This project still uses the previous setup/),
    ).toBeInTheDocument();
  });

  it("drops the status claim once every check is clean", () => {
    mocks.migrationData.apis = { status: "loaded", count: 0 };
    mocks.migrationData.exports = { status: "loaded", count: 0 };
    render(<V4MigrationHeaderContent projectId="project-1" />);
    expect(
      screen.queryByText(/This project still uses the previous setup/),
    ).not.toBeInTheDocument();
  });

  it("drops the status claim while checks are still loading", () => {
    mocks.migrationData.apis = { status: "loading", count: 0 };
    render(<V4MigrationHeaderContent projectId="project-1" />);
    expect(
      screen.queryByText(/This project still uses the previous setup/),
    ).not.toBeInTheDocument();
  });

  it("reserves a close-button gutter on the title row when the host asks", () => {
    // The modal host floats the dialog's fallback close button over the
    // body's top-right corner; without the gutter it overlaps the
    // right-aligned status link.
    render(
      <V4MigrationHeaderContent
        projectId="project-1"
        titleRowClassName="pr-6"
      />,
    );
    const link = screen.getByRole("link", { name: "View Status" });
    expect(link).toHaveAttribute("href", "/v4-migration");
    expect(link.parentElement).toHaveClass("pr-6");
  });
});
