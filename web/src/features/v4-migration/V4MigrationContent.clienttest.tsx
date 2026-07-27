import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { V4MigrationDetailsContent } from "./V4MigrationContent";

const mocks = vi.hoisted(() => ({
  migrationData: {
    sdk: {
      status: "latest" as const,
      sdkUsageSeries: [],
      upgradeRequiredCount: 0,
    },
    evals: { status: "loaded" as const, count: 0 },
    apis: { status: "loaded" as const, count: 1 },
    exports: { status: "loaded" as const, count: 3 },
    apiUsage: [{ endpoint: "GET /api/public/traces", count: 42 }],
    legacyIntegrations: ["PostHog", "Mixpanel", "Blob Storage"],
  },
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ query: { projectId: "project-1" } }),
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
  useEvalUpgradeAssistantPlan: () => ({
    canUseAssistant: false,
    assistantCanUpgrade: false,
    assistantPrompt: "",
  }),
}));

vi.mock(
  "@/src/ee/features/in-app-agent/components/InAppAiAgentProvider",
  () => ({
    useCanUseInAppAgent: () => false,
    useInAppAiAgent: () => ({ setOpen: vi.fn(), submit: vi.fn() }),
  }),
);

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
});
