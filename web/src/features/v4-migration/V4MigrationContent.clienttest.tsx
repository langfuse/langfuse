import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  V4MigrationAgentUpgradeSection,
  V4MigrationDetailsContent,
  V4MigrationHeaderContent,
} from "./V4MigrationContent";
import {
  type MigrationActionState,
  type MigrationCountState,
} from "./migrationData";
import {
  type V4MigrationSdkState,
  type V4MigrationSdkUsageSeries,
} from "./sdkVersionStatus";
import { V4_MIGRATION_LOOKBACK_DAYS } from "./migrationData";
import { TIME_RANGES } from "@langfuse/shared";

const makeSdkUsageSeries = (
  overrides: Partial<V4MigrationSdkUsageSeries>,
): V4MigrationSdkUsageSeries => ({
  sdkName: "python",
  sdkVersion: "4.7.1",
  canonicalSdkName: "python",
  publicKey: "pk-lf-1234567890abcdef",
  count: 10,
  firstSeen: "2026-07-20T10:00:00Z",
  lastSeen: "2026-07-23T10:00:00Z",
  hasDelayedOtelEvents: null,
  attributionStatus: "attributed",
  v4MigrationStatus: "compatible",
  upgradeCompleted: false,
  ...overrides,
});

const cleanSdkState = (): V4MigrationSdkState => ({
  status: "latest",
  sdkUsageSeries: [],
  upgradeRequiredCount: 0,
  delayedOtelIngestionCount: 0,
});

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
      delayedOtelIngestionCount: 0,
    } as V4MigrationSdkState,
    evals: { status: "loaded", count: 0 } as MigrationCountState,
    experiments: {
      status: "loaded",
      result: "not_required",
    } as MigrationActionState,
    experimentInstrumentationUpgradePath: null as "sdk" | "api" | null,
    apis: { status: "loaded", count: 1 } as MigrationCountState,
    exports: { status: "loaded", count: 3 } as MigrationCountState,
    apiUsage: [
      {
        endpoint: "GET /api/public/traces",
        count: 42,
        lastSeen: "2026-07-23T10:37:00Z",
      },
    ],
    legacyIntegrations: ["PostHog", "Mixpanel", "Blob Storage"],
  },
  canToggleV4: true,
  isBetaEnabled: true,
  hasApiKeyCreateAccess: true,
  createProjectApiKey: vi.fn(),
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

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({
      projectApiKeys: { invalidate: vi.fn() },
    }),
    projectApiKeys: {
      create: {
        useMutation: () => ({
          mutateAsync: mocks.createProjectApiKey,
          isPending: false,
        }),
      },
    },
  },
}));

vi.mock("@/src/features/projects/hooks", () => ({
  useProject: () => ({ organization: { id: "org-1" } }),
}));

vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => mocks.hasApiKeyCreateAccess,
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
  useV4Beta: () => ({
    canToggleV4: mocks.canToggleV4,
    isBetaEnabled: mocks.isBetaEnabled,
  }),
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
    mocks.migrationData.experiments = {
      status: "loaded",
      result: "not_required",
    };
    mocks.migrationData.experimentInstrumentationUpgradePath = null;
    mocks.canToggleV4 = true;
    mocks.isBetaEnabled = true;
    mocks.migrationData.sdk = cleanSdkState();
    mocks.migrationData.apis = { status: "loaded", count: 1 };
    mocks.migrationData.exports = { status: "loaded", count: 3 };
    mocks.migrationData.apiUsage = [
      {
        endpoint: "GET /api/public/traces",
        count: 42,
        lastSeen: "2026-07-23T10:37:00Z",
      },
    ];
    mocks.migrationData.legacyIntegrations = [
      "PostHog",
      "Mixpanel",
      "Blob Storage",
    ];
  });

  it("uses deprecated terminology and links to the migration guides", () => {
    render(<V4MigrationDetailsContent projectId="project-1" />);

    expect(screen.getByText("Migrate APIs")).toBeInTheDocument();
    expect(screen.getByText("Migrate Integrations")).toBeInTheDocument();
    expect(screen.queryByText("Legacy APIs")).not.toBeInTheDocument();
    expect(screen.queryByText("Legacy Integrations")).not.toBeInTheDocument();

    expect(
      screen.getByRole("link", { name: "GET /api/public/traces" }),
    ).toHaveAttribute(
      "href",
      "https://langfuse.com/faq/all/deprecated-api-migration",
    );
    expect(screen.getByText(/42 calls · last seen/)).toHaveAttribute(
      "title",
      "Last seen at 2026-07-23T10:37:00Z",
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

  it("collapses clean sections into one up-to-date summary", () => {
    mocks.migrationData.apis = { status: "loaded", count: 0 };
    mocks.migrationData.exports = { status: "loaded", count: 0 };
    mocks.migrationData.apiUsage = [];
    mocks.migrationData.legacyIntegrations = [];

    render(<V4MigrationDetailsContent projectId="project-1" />);

    expect(
      screen.getByText(
        "Evals, experiments, APIs and integrations are up to date.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Repoint Evals")).not.toBeInTheDocument();
    expect(screen.queryByText("Experiments")).not.toBeInTheDocument();
    expect(screen.queryByText("Migrate APIs")).not.toBeInTheDocument();
    expect(screen.queryByText("Migrate Integrations")).not.toBeInTheDocument();
  });

  it("keeps affected sections while summarizing the clean ones", () => {
    // Default mock: apis count 1, exports count 3; evals and experiments clean.
    render(<V4MigrationDetailsContent projectId="project-1" />);

    expect(screen.getByText("Migrate APIs")).toBeInTheDocument();
    expect(screen.getByText("Migrate Integrations")).toBeInTheDocument();
    expect(
      screen.getByText("Evals and experiments are up to date."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Repoint Evals", { exact: true }),
    ).not.toBeInTheDocument();
  });

  it("shows the experiment instrumentation upgrade requirement", () => {
    mocks.migrationData.experiments = { status: "loaded", result: "required" };
    mocks.migrationData.experimentInstrumentationUpgradePath = "sdk";

    render(<V4MigrationDetailsContent projectId="project-1" />);

    fireEvent.click(screen.getByRole("button", { name: /Experiments/ }));
    expect(screen.getByText(/POST \/dataset-run-items/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Upgrade the SDK" }),
    ).toBeInTheDocument();
  });

  it("shows inconclusive experiment runner usage as needing review", () => {
    mocks.migrationData.experiments = {
      status: "loaded",
      result: "sdk_usage_inconclusive",
    };
    mocks.migrationData.experimentInstrumentationUpgradePath = "sdk";

    render(<V4MigrationDetailsContent projectId="project-1" />);

    fireEvent.click(screen.getByRole("button", { name: /Experiments/ }));
    expect(
      screen.getByText(/supports the experiment runner/),
    ).toBeInTheDocument();
    expect(screen.getByText(".link()")).toBeInTheDocument();
  });

  it("asks direct API users to replace dataset-run-items POST usage", () => {
    mocks.migrationData.experiments = { status: "loaded", result: "required" };
    mocks.migrationData.experimentInstrumentationUpgradePath = "api";

    render(<V4MigrationDetailsContent projectId="project-1" />);

    fireEvent.click(screen.getByRole("button", { name: /Experiments/ }));
    expect(
      screen.getByRole("link", {
        name: "OTel experiment instrumentation guide",
      }),
    ).toBeInTheDocument();
  });

  it("hides the tracing sections when no ingestion data was detected", () => {
    mocks.migrationData.sdk.status = "no_data";

    render(<V4MigrationDetailsContent projectId="project-1" />);

    expect(screen.queryByText("Update SDK")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Update OTel Instrumentation"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Needs review")).not.toBeInTheDocument();
  });

  it("hides the tracing sections when everything detected is up to date", () => {
    mocks.migrationData.sdk = {
      ...cleanSdkState(),
      sdkUsageSeries: [
        makeSdkUsageSeries({}),
        makeSdkUsageSeries({
          sdkName: "otelcol",
          sdkVersion: "0.98.0",
          canonicalSdkName: null,
          v4MigrationStatus: "unknown",
          hasDelayedOtelEvents: false,
        }),
      ],
    };

    render(<V4MigrationDetailsContent projectId="project-1" />);

    expect(screen.queryByText("Update SDK")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Update OTel Instrumentation"),
    ).not.toBeInTheDocument();
  });

  it("lists every detected SDK series when one needs an upgrade", () => {
    mocks.migrationData.sdk = {
      status: "legacy",
      sdkUsageSeries: [
        makeSdkUsageSeries({
          sdkVersion: "2.60.3",
          v4MigrationStatus: "upgrade_required",
        }),
        makeSdkUsageSeries({ publicKey: "pk-lf-fedcba0987654321" }),
      ],
      upgradeRequiredCount: 1,
      delayedOtelIngestionCount: 0,
    };

    render(<V4MigrationDetailsContent projectId="project-1" />);

    expect(screen.getByText("Update SDK")).toBeInTheDocument();
    expect(
      within(screen.getByText("Update SDK").closest("button")!).getByText("1"),
    ).toBeInTheDocument();
    expect(screen.getByText("Python 2.60.3")).toBeInTheDocument();
    expect(screen.getByText("Python 4.7.1")).toBeInTheDocument();
    expect(screen.getByText(/upgrade required/)).toBeInTheDocument();
    // The public key deep-links to the exact evidence: the events table
    // filtered by this key over the detection lookback window.
    expect(
      screen.getByRole("link", { name: "pk-lf-123…abcdef" }),
    ).toHaveAttribute(
      "href",
      `/project/project-1/observations?filter=${encodeURIComponent(
        "ingestionApiKey;stringOptions;;any of;pk-lf-1234567890abcdef",
      )}&dateRange=14d`,
    );
    expect(
      screen.queryByText("Update OTel Instrumentation"),
    ).not.toBeInTheDocument();
  });

  it("shows delayed OTel exporters and hides the clean SDK section", () => {
    mocks.migrationData.sdk = {
      status: "otel_header_required",
      sdkUsageSeries: [
        makeSdkUsageSeries({}),
        makeSdkUsageSeries({
          sdkName: "openlit",
          sdkVersion: "1.35.4",
          canonicalSdkName: null,
          v4MigrationStatus: "unknown",
          hasDelayedOtelEvents: true,
          publicKey: "pk-lf-aaaa000011112222",
        }),
        makeSdkUsageSeries({
          sdkName: "otelcol",
          sdkVersion: "0.98.0",
          canonicalSdkName: null,
          v4MigrationStatus: "unknown",
          hasDelayedOtelEvents: false,
          publicKey: "pk-lf-bbbb333344445555",
        }),
      ],
      upgradeRequiredCount: 0,
      delayedOtelIngestionCount: 1,
    };

    render(<V4MigrationDetailsContent projectId="project-1" />);

    expect(screen.getByText("Update OTel Instrumentation")).toBeInTheDocument();
    expect(
      within(
        screen.getByText("Update OTel Instrumentation").closest("button")!,
      ).getByText("1"),
    ).toBeInTheDocument();
    expect(screen.getByText(/delayed ingestion path/)).toBeInTheDocument();
    expect(screen.getByText("openlit 1.35.4")).toBeInTheDocument();
    expect(screen.getByText("otelcol 0.98.0")).toBeInTheDocument();
    expect(screen.getByText("· delayed")).toBeInTheDocument();
    expect(screen.getByText("· real-time")).toBeInTheDocument();
    expect(screen.queryByText("Update SDK")).not.toBeInTheDocument();
  });

  it("keeps Update SDK visible for a recognized SDK with an unparseable version", () => {
    mocks.migrationData.sdk = {
      status: "unknown",
      sdkUsageSeries: [
        makeSdkUsageSeries({
          sdkVersion: "not-a-version",
          v4MigrationStatus: "unknown",
        }),
      ],
      upgradeRequiredCount: 0,
      delayedOtelIngestionCount: 0,
    };

    render(<V4MigrationDetailsContent projectId="project-1" />);

    expect(screen.getByText("Update SDK")).toBeInTheDocument();
    // Badge and sentence share the same count.
    expect(
      within(screen.getByText("Update SDK").closest("button")!).getByText("1"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/1 detected SDK configuration needs an update/),
    ).toBeInTheDocument();
    expect(screen.getByText("· version not recognized")).toBeInTheDocument();
  });

  it("keeps the evidence-link date range expressible as a table range", () => {
    // rangeFromString falls back to the page default when the abbreviation is
    // unknown, which would silently unscope the evidence links.
    expect(
      Object.values(TIME_RANGES).map((range) => range.abbreviation),
    ).toContain(`${V4_MIGRATION_LOOKBACK_DAYS}d`);
  });

  it("renders the public key as plain text when the v4 preview is off", () => {
    mocks.isBetaEnabled = false;
    mocks.migrationData.sdk = {
      status: "legacy",
      sdkUsageSeries: [
        makeSdkUsageSeries({
          sdkVersion: "2.60.3",
          v4MigrationStatus: "upgrade_required",
        }),
      ],
      upgradeRequiredCount: 1,
      delayedOtelIngestionCount: 0,
    };

    render(<V4MigrationDetailsContent projectId="project-1" />);

    expect(screen.getByText("pk-lf-123…abcdef")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "pk-lf-123…abcdef" }),
    ).not.toBeInTheDocument();
  });

  it("shows ingestion-API traffic without an SDK header as Upgrade Instrumentation", () => {
    mocks.migrationData.sdk = {
      status: "unknown",
      sdkUsageSeries: [
        makeSdkUsageSeries({
          sdkName: "unknown",
          sdkVersion: "unknown",
          canonicalSdkName: null,
          attributionStatus: "missing_name_and_version",
          v4MigrationStatus: "unknown",
        }),
      ],
      upgradeRequiredCount: 0,
      delayedOtelIngestionCount: 0,
    };

    render(<V4MigrationDetailsContent projectId="project-1" />);

    expect(screen.getByText("Upgrade Instrumentation")).toBeInTheDocument();
    expect(
      within(
        screen.getByText("Upgrade Instrumentation").closest("button")!,
      ).getByText("1"),
    ).toBeInTheDocument();
    expect(screen.getByText("Custom instrumentation")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Python or JS SDK" }),
    ).toHaveAttribute(
      "href",
      "https://langfuse.com/docs/observability/sdk/overview",
    );
    expect(
      screen.getByRole("link", { name: "OpenTelemetry endpoint" }),
    ).toHaveAttribute(
      "href",
      "https://langfuse.com/integrations/native/opentelemetry",
    );
    expect(screen.queryByText("Update SDK")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Update OTel Instrumentation"),
    ).not.toBeInTheDocument();
  });

  it("renders the agent upgrade group with the prompt CTA", () => {
    render(<V4MigrationDetailsContent projectId="project-1" />);

    expect(
      screen.getByText(/Paste prompt into Claude Code or other coding agents/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy prompt" }),
    ).toBeInTheDocument();
  });

  it("shows the preview-toggle section only when the session can toggle v4", () => {
    const { unmount } = render(
      <V4MigrationDetailsContent projectId="project-1" />,
    );
    expect(
      screen.getByText(/Compare traces while you upgrade/),
    ).toBeInTheDocument();
    unmount();

    mocks.canToggleV4 = false;
    render(<V4MigrationDetailsContent projectId="project-1" />);
    expect(
      screen.queryByText(/Compare traces while you upgrade/),
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
    mocks.migrationData.experiments = {
      status: "loaded",
      result: "not_required",
    };
    mocks.migrationData.experimentInstrumentationUpgradePath = null;
    mocks.migrationData.apis = { status: "loaded", count: 1 };
    mocks.migrationData.exports = { status: "loaded", count: 3 };
    mocks.hasApiKeyCreateAccess = true;
    mocks.createProjectApiKey.mockReset();
    mocks.createProjectApiKey.mockImplementation(
      ({ projectId }: { projectId: string }) =>
        Promise.resolve({
          secretKey: `sk-lf-${projectId}`,
          publicKey: `pk-lf-${projectId}`,
        }),
    );
  });

  it("claims the project needs migrating while checks report action needed", () => {
    render(<V4MigrationHeaderContent projectId="project-1" />);
    expect(screen.getByText(/Your setup is outdated/)).toBeInTheDocument();
  });

  it("drops the status claim once every check is clean", () => {
    mocks.migrationData.apis = { status: "loaded", count: 0 };
    mocks.migrationData.exports = { status: "loaded", count: 0 };
    render(<V4MigrationHeaderContent projectId="project-1" />);
    expect(
      screen.queryByText(/Your setup is outdated/),
    ).not.toBeInTheDocument();
  });

  it("drops the status claim while checks are still loading", () => {
    mocks.migrationData.apis = { status: "loading", count: 0 };
    render(<V4MigrationHeaderContent projectId="project-1" />);
    expect(
      screen.queryByText(/Your setup is outdated/),
    ).not.toBeInTheDocument();
  });

  it("reserves a close-button gutter on the title row when the host asks", () => {
    // The modal host floats the dialog's fallback close button over the
    // body's top-right corner; without the gutter it overlaps the title.
    render(
      <V4MigrationHeaderContent
        projectId="project-1"
        titleRowClassName="pr-6"
      />,
    );
    expect(screen.getByText("Migrate to v4").parentElement).toHaveClass("pr-6");
  });

  it("links to the docs from the details footer", () => {
    render(<V4MigrationDetailsContent projectId="project-1" />);

    expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute(
      "href",
      "https://langfuse.com/docs/v4",
    );
  });

  it("does not create credentials when revealing or copying the prompt", () => {
    render(<V4MigrationAgentUpgradeSection projectId="project-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));

    expect(screen.getByText("coding-agent-prompt")).toBeInTheDocument();
    expect(mocks.createProjectApiKey).not.toHaveBeenCalled();

    // Second click copies; still no credentials. (jsdom has no clipboard.)
    Object.assign(navigator, { clipboard: { writeText: vi.fn() } });
    fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));
    expect(mocks.createProjectApiKey).not.toHaveBeenCalled();
  });

  it("creates keys only on the explicit create action and shows an env block", async () => {
    render(<V4MigrationAgentUpgradeSection projectId="project-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));
    const createButton = screen.getByRole("button", {
      name: "Create API keys",
    });

    fireEvent.click(createButton);
    expect(mocks.createProjectApiKey).toHaveBeenCalledWith({
      projectId: "project-1",
      note: "v4-migration-key",
    });

    await waitFor(() =>
      expect(
        screen.getByText(/LANGFUSE_PUBLIC_KEY=pk-lf-project-1/),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/LANGFUSE_SECRET_KEY=sk-lf-project-1/),
    ).toBeInTheDocument();
    expect(screen.getByText(/LANGFUSE_BASE_URL=/)).toBeInTheDocument();
    // The secret must never leak into the agent prompt.
    expect(screen.getByText("coding-agent-prompt").textContent).not.toContain(
      "sk-lf-project-1",
    );
    // The create action is consumed; no accidental duplicates.
    expect(
      screen.queryByRole("button", { name: "Create API keys" }),
    ).not.toBeInTheDocument();
    expect(mocks.createProjectApiKey).toHaveBeenCalledTimes(1);
  });

  it("keeps the prompt available but disables key creation without access", () => {
    mocks.hasApiKeyCreateAccess = false;
    render(<V4MigrationAgentUpgradeSection projectId="project-1" />);

    const promptButton = screen.getByRole("button", { name: "Copy prompt" });
    expect(promptButton).toBeEnabled();
    fireEvent.click(promptButton);
    expect(screen.getByText("coding-agent-prompt")).toBeInTheDocument();

    const createButton = screen.getByRole("button", {
      name: "Create API keys",
    });
    expect(createButton).toBeDisabled();
    fireEvent.click(createButton);
    expect(mocks.createProjectApiKey).not.toHaveBeenCalled();
  });

  it("requires a fresh explicit creation when the project changes", async () => {
    const { rerender } = render(
      <V4MigrationAgentUpgradeSection key="project-1" projectId="project-1" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));
    fireEvent.click(screen.getByRole("button", { name: "Create API keys" }));

    await waitFor(() =>
      expect(
        screen.getByText(/LANGFUSE_PUBLIC_KEY=pk-lf-project-1/),
      ).toBeInTheDocument(),
    );

    rerender(
      <V4MigrationAgentUpgradeSection key="project-2" projectId="project-2" />,
    );

    expect(
      screen.queryByText(/LANGFUSE_PUBLIC_KEY=pk-lf-project-1/),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));
    fireEvent.click(screen.getByRole("button", { name: "Create API keys" }));
    await waitFor(() =>
      expect(
        screen.getByText(/LANGFUSE_PUBLIC_KEY=pk-lf-project-2/),
      ).toBeInTheDocument(),
    );
    expect(mocks.createProjectApiKey).toHaveBeenLastCalledWith({
      projectId: "project-2",
      note: "v4-migration-key",
    });
  });
});
