import React from "react";
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
import { TABLE_AGGREGATION_OPTIONS } from "@langfuse/shared";
import { rangeFromString } from "@/src/utils/date-range-utils";

const makeSdkUsageSeries = (
  overrides: Partial<V4MigrationSdkUsageSeries>,
): V4MigrationSdkUsageSeries => ({
  sdkName: "python",
  sdkVersion: "4.7.1",
  canonicalSdkName: "python",
  publicKey: "pk-lf-1234567890abcdef",
  count: 10,
  eventsCount: 10,
  firstSeen: "2026-07-20T10:00:00Z",
  lastSeen: "2026-07-23T10:00:00Z",
  hasDelayedOtelEvents: null,
  attributionStatus: "attributed",
  v4MigrationStatus: "compatible",
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
  capture: vi.fn(),
  openAssistant: vi.fn(),
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
  canUpdateOrgSettings: true,
  aiFeaturesEnabled: true,
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
  usePostHogClientCapture: () => mocks.capture,
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
  useQueryProjectOrOrganization: () => ({
    organization: {
      id: "org-1",
      aiFeaturesEnabled: mocks.aiFeaturesEnabled,
    },
  }),
}));

vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => mocks.hasApiKeyCreateAccess,
}));

vi.mock("@/src/features/rbac/utils/checkOrganizationAccess", () => ({
  useHasOrganizationAccess: () => mocks.canUpdateOrgSettings,
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
    openAssistant: mocks.openAssistant,
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

// Content stays rendered so section-body assertions need no expanding; the
// trigger toggles like Radix (open ↔ closed, seeded from defaultOpen) so the
// expand-only guard in Section is genuinely exercised.
vi.mock("@/src/components/ui/collapsible", () => {
  const ToggleContext = React.createContext<() => void>(() => {});
  return {
    Collapsible: ({
      children,
      defaultOpen,
      onOpenChange,
    }: {
      children: React.ReactNode;
      defaultOpen?: boolean;
      onOpenChange?: (open: boolean) => void;
    }) => {
      const [isOpen, setIsOpen] = React.useState(defaultOpen ?? false);
      const toggle = () => {
        const next = !isOpen;
        setIsOpen(next);
        onOpenChange?.(next);
      };
      return (
        <ToggleContext.Provider value={toggle}>
          <div>{children}</div>
        </ToggleContext.Provider>
      );
    },
    CollapsibleTrigger: ({ children }: { children: React.ReactNode }) => {
      const toggle = React.useContext(ToggleContext);
      return <button onClick={toggle}>{children}</button>;
    },
    CollapsibleContent: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
  };
});

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
    mocks.canUpdateOrgSettings = true;
    mocks.aiFeaturesEnabled = true;
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
    // The explicit evidence link targets this key + SDK name/version over the
    // detection lookback window, so versions on the same key stay distinct.
    const outdatedRow = screen.getByText("Python 2.60.3").closest("li")!;
    const evidenceLink = within(outdatedRow).getByRole("link", {
      name: "View observations",
    });
    expect(evidenceLink).toHaveAttribute(
      "href",
      `/project/project-1/observations?filter=${encodeURIComponent(
        "ingestionApiKey;stringOptions;;any of;pk-lf-1234567890abcdef," +
          "ingestionSdkName;stringOptions;;any of;python," +
          "ingestionSdkVersion;stringOptions;;any of;2.60.3",
      )}&dateRange=14d`,
    );
    expect(evidenceLink).toHaveAttribute("target", "_blank");
    expect(evidenceLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(
      within(outdatedRow).queryByRole("link", {
        name: "pk-lf-123…abcdef",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Update OTel Instrumentation"),
    ).not.toBeInTheDocument();
  });

  it("keeps outdated SDK usage surfaced when a newer version later used the same key", () => {
    // The check reports what it observed in the lookback window: a newer SDK
    // ingesting later on the same public key is not evidence that the
    // outdated usage is gone, so it must not retire the offender.
    mocks.migrationData.sdk = {
      status: "legacy",
      sdkUsageSeries: [
        makeSdkUsageSeries({
          sdkVersion: "2.60.3",
          v4MigrationStatus: "upgrade_required",
          firstSeen: "2026-07-20T09:00:00Z",
          lastSeen: "2026-07-20T10:00:00Z",
        }),
        makeSdkUsageSeries({
          firstSeen: "2026-07-21T09:00:00Z",
          lastSeen: "2026-07-21T10:00:00Z",
        }),
      ],
      upgradeRequiredCount: 1,
      delayedOtelIngestionCount: 0,
    };

    render(<V4MigrationDetailsContent projectId="project-1" />);

    expect(
      within(screen.getByText("Update SDK").closest("button")!).getByText("1"),
    ).toBeInTheDocument();
    expect(screen.getByText("Python 2.60.3")).toBeInTheDocument();
    expect(screen.getByText("Python 4.7.1")).toBeInTheDocument();
    expect(screen.getByText(/upgrade required/)).toBeInTheDocument();
    expect(screen.queryByText(/upgrade completed/)).not.toBeInTheDocument();
  });

  it("renders the key as plain text when an offender has no observation evidence", () => {
    // A scores-only offender: detection counts score ingestions, but the
    // events table has nothing for this key — a link would open an empty
    // table, so the evidence link must stay hidden.
    mocks.migrationData.sdk = {
      status: "legacy",
      sdkUsageSeries: [
        makeSdkUsageSeries({
          sdkVersion: "2.60.3",
          v4MigrationStatus: "upgrade_required",
          eventsCount: 0,
        }),
      ],
      upgradeRequiredCount: 1,
      delayedOtelIngestionCount: 0,
    };

    render(<V4MigrationDetailsContent projectId="project-1" />);

    expect(screen.getByText("Python 2.60.3")).toBeInTheDocument();
    expect(screen.getByText("pk-lf-123…abcdef")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "View observations" }),
    ).not.toBeInTheDocument();
  });

  it("links keyless raw OTel observations with an exact empty-key filter", () => {
    mocks.migrationData.sdk = {
      status: "otel_header_required",
      sdkUsageSeries: [
        makeSdkUsageSeries({
          sdkName: "openlit",
          sdkVersion: "1.35.4",
          canonicalSdkName: null,
          v4MigrationStatus: "unknown",
          hasDelayedOtelEvents: true,
          publicKey: "",
        }),
      ],
      upgradeRequiredCount: 0,
      delayedOtelIngestionCount: 1,
    };

    render(<V4MigrationDetailsContent projectId="project-1" />);

    expect(screen.getByText("No API key")).toBeInTheDocument();
    const evidenceLink = screen.getByRole("link", {
      name: "View observations",
    });
    expect(evidenceLink).toHaveAttribute(
      "href",
      `/project/project-1/observations?filter=${encodeURIComponent(
        "ingestionApiKey;stringOptions;;any of;," +
          "ingestionSdkName;stringOptions;;any of;openlit," +
          "ingestionSdkVersion;stringOptions;;any of;1.35.4",
      )}&dateRange=14d`,
    );
    expect(evidenceLink).toHaveAttribute("target", "_blank");
    expect(evidenceLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("captures panel_checks_loaded once when all checks settle", () => {
    const { rerender } = render(
      <V4MigrationDetailsContent projectId="project-1" />,
    );
    rerender(<V4MigrationDetailsContent projectId="project-1" />);

    const loadedCalls = mocks.capture.mock.calls.filter(
      ([name]) => name === "v4_migration:panel_checks_loaded",
    );
    expect(loadedCalls).toHaveLength(1);
    expect(loadedCalls[0]![1]).toEqual({
      readiness: "action-needed",
      sdkStatus: "latest",
      sdkActionableCount: 0,
      delayedOtelCount: 0,
      customInstrumentationCount: 0,
      evalsCount: 0,
      apisCount: 1,
      integrationsCount: 3,
      experimentsResult: "not_required",
    });
  });

  it("holds panel_checks_loaded while a check is still running", () => {
    mocks.migrationData.evals = { status: "loading", count: 0 };

    render(<V4MigrationDetailsContent projectId="project-1" />);

    expect(mocks.capture).not.toHaveBeenCalledWith(
      "v4_migration:panel_checks_loaded",
      expect.anything(),
    );
  });

  it("holds panel_checks_loaded when one check errors while another loads", () => {
    // readiness collapses to "unavailable" on the first error, but the event
    // must wait for the in-flight checks instead of locking in a mid-flight
    // snapshot; errored counts then report null, not a clean-looking zero.
    mocks.migrationData.evals = { status: "error", count: 0 };
    mocks.migrationData.apis = { status: "loading", count: 0 };

    render(<V4MigrationDetailsContent projectId="project-1" />);

    expect(mocks.capture).not.toHaveBeenCalledWith(
      "v4_migration:panel_checks_loaded",
      expect.anything(),
    );

    mocks.migrationData.apis = { status: "loaded", count: 1 };
    render(<V4MigrationDetailsContent projectId="project-1" />);

    expect(mocks.capture).toHaveBeenCalledWith(
      "v4_migration:panel_checks_loaded",
      expect.objectContaining({ readiness: "unavailable", evalsCount: null }),
    );
  });

  it("captures section_expanded and evidence_link_clicked in the SDK section", () => {
    const onNavigate = vi.fn();
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

    render(
      <V4MigrationDetailsContent
        projectId="project-1"
        onNavigate={onNavigate}
      />,
    );

    fireEvent.click(screen.getByText("Update SDK").closest("button")!);
    expect(mocks.capture).toHaveBeenCalledWith(
      "v4_migration:section_expanded",
      { section: "sdk" },
    );

    // Collapsing must not count as engagement.
    fireEvent.click(screen.getByText("Update SDK").closest("button")!);
    expect(
      mocks.capture.mock.calls.filter(
        ([name]) => name === "v4_migration:section_expanded",
      ),
    ).toHaveLength(1);

    fireEvent.click(screen.getByRole("link", { name: "View observations" }));
    expect(onNavigate).not.toHaveBeenCalled();
    // Only bounded values: the canonical SDK enum and status enums — never
    // the raw client-supplied sdkName/sdkVersion header strings.
    expect(mocks.capture).toHaveBeenCalledWith(
      "v4_migration:evidence_link_clicked",
      {
        section: "sdk",
        sdkName: "python",
        v4MigrationStatus: "upgrade_required",
        attributionStatus: "attributed",
      },
    );

    fireEvent.click(screen.getByRole("link", { name: "upgrade path" }));
    expect(mocks.capture).toHaveBeenCalledWith(
      "v4_migration:section_link_clicked",
      { section: "sdk", link: "sdk_upgrade_docs" },
    );
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

  it("keeps Update SDK visible for a recognized SDK with an unparsable version", () => {
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
    // The events table resolves ?dateRange= through rangeFromString against
    // TABLE_AGGREGATION_OPTIONS; an unknown abbreviation silently falls back
    // to the page default and unscopes the evidence links.
    expect(
      rangeFromString(
        `${V4_MIGRATION_LOOKBACK_DAYS}d`,
        TABLE_AGGREGATION_OPTIONS,
        "last1Day",
      ),
    ).toEqual({ range: `last${V4_MIGRATION_LOOKBACK_DAYS}Days` });
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
      screen.queryByRole("link", { name: "View observations" }),
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
    // Unattributed series ("unknown" SDK name/version) keep a key-only
    // evidence link — "unknown" is the fallback bucket, not an exact value.
    const customInstrumentationRow = screen
      .getByText("Custom instrumentation")
      .closest("li")!;
    const evidenceLink = within(customInstrumentationRow).getByRole("link", {
      name: "View observations",
    });
    expect(evidenceLink).toHaveAttribute(
      "href",
      `/project/project-1/observations?filter=${encodeURIComponent(
        "ingestionApiKey;stringOptions;;any of;pk-lf-1234567890abcdef",
      )}&dateRange=14d`,
    );
    expect(evidenceLink).toHaveAttribute("target", "_blank");
    expect(evidenceLink).toHaveAttribute("rel", "noopener noreferrer");
    // The guidance stays language-agnostic: the upgrade applies to every
    // Langfuse SDK, so the copy must not read as Python-or-JS-only.
    expect(
      screen.getByRole("link", { name: "any Langfuse SDK" }),
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

  it("starts the assistant only after confirmation", async () => {
    mocks.migrationData.evals = { status: "loaded", count: 1 };
    mocks.openAssistant.mockReturnValue(true);

    render(<V4MigrationDetailsContent projectId="project-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Use Assistant" }));
    const migrationDialog = screen.getByRole("dialog");
    fireEvent.click(
      within(migrationDialog).getByRole("button", {
        name: /^Use Assistant/,
      }),
    );
    fireEvent.click(
      within(migrationDialog).getByRole("button", {
        name: "Start upgrade now",
      }),
    );

    await waitFor(() => {
      expect(mocks.openAssistant).toHaveBeenCalledWith("v4_migration");
    });
    expect(mocks.submitAgentMessage).toHaveBeenCalledWith(
      "eval-upgrade-prompt",
      { newConversation: true },
    );
  });

  it("shows the admin handoff after a non-admin chooses the Assistant", () => {
    mocks.migrationData.evals = { status: "loaded", count: 1 };
    mocks.canUpdateOrgSettings = false;
    mocks.aiFeaturesEnabled = false;

    render(<V4MigrationDetailsContent projectId="project-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Use Assistant" }));
    const migrationDialog = screen.getByRole("dialog");
    fireEvent.click(
      within(migrationDialog).getByRole("button", {
        name: /^Use Assistant/,
      }),
    );

    expect(
      screen.getByRole("heading", {
        name: "Ask your organization admin to enable AI features",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/enable AI features for our Langfuse organization/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Continue with manual upgrade" }),
    ).not.toBeInTheDocument();
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
