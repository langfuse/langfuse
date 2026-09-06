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
  V4_MIGRATION_LOOKBACK_DAYS,
} from "./migrationData";
import {
  type V4MigrationSdkState,
  type V4MigrationSdkUsageSeries,
} from "./sdkVersionStatus";
import { TABLE_AGGREGATION_OPTIONS } from "@langfuse/shared";
import { rangeFromString } from "@/src/utils/date-range-utils";

const makeSdkUsageSeries = (
  overrides: Partial<V4MigrationSdkUsageSeries> = {},
): V4MigrationSdkUsageSeries => {
  const source = overrides.source ?? "ingestion-api-dual-write";
  const ingestionPath =
    overrides.ingestionPath ??
    (source === "ingestion-api-dual-write" ? "ingestion_api" : "otel");
  const deliveryMode =
    overrides.deliveryMode ?? (source === "otel" ? "realtime" : "delayed");
  const sdkName = overrides.sdkName ?? "python";
  const sdkVersion = overrides.sdkVersion ?? "4.7.1";
  const canonicalSdkName =
    overrides.canonicalSdkName !== undefined
      ? overrides.canonicalSdkName
      : sdkName === "python"
        ? "python"
        : sdkName === "javascript" || sdkName.startsWith("@langfuse/")
          ? "javascript"
          : null;
  const sdkVersionMajor =
    overrides.sdkVersionMajor !== undefined
      ? overrides.sdkVersionMajor
      : Number(sdkVersion.match(/^v?(\d+)/)?.[1] ?? NaN);
  const resolvedMajor = Number.isFinite(sdkVersionMajor)
    ? Number(sdkVersionMajor)
    : null;
  const latestMajor =
    canonicalSdkName === "python"
      ? 4
      : canonicalSdkName === "javascript"
        ? 5
        : null;
  const v4MigrationStatus =
    overrides.v4MigrationStatus ??
    (canonicalSdkName === null || resolvedMajor === null
      ? "unknown"
      : resolvedMajor >= (latestMajor ?? 0)
        ? "compatible"
        : "upgrade_required");
  const remediationType =
    overrides.remediationType ??
    (canonicalSdkName !== null
      ? "update_sdk"
      : ingestionPath === "otel"
        ? "update_otel_instrumentation"
        : "upgrade_instrumentation");
  const actionLevel =
    overrides.actionLevel ??
    (remediationType === "update_sdk"
      ? v4MigrationStatus === "compatible"
        ? "none"
        : "required"
      : remediationType === "update_otel_instrumentation"
        ? deliveryMode === "realtime"
          ? "none"
          : "required"
        : "required");

  return {
    source,
    ingestionPath,
    deliveryMode,
    sdkName,
    sdkVersion,
    canonicalSdkName,
    sdkVersionMajor: resolvedMajor,
    latestSdkMajor:
      overrides.latestSdkMajor !== undefined
        ? overrides.latestSdkMajor
        : latestMajor,
    isValidSdkVersion: overrides.isValidSdkVersion ?? resolvedMajor !== null,
    publicKey: overrides.publicKey ?? "pk-lf-1234567890abcdef",
    eventCount: overrides.eventCount ?? 10,
    firstSeen: overrides.firstSeen ?? "2026-07-20T10:00:00Z",
    lastSeen: overrides.lastSeen ?? "2026-07-23T10:00:00Z",
    attributionStatus: overrides.attributionStatus ?? "attributed",
    v4MigrationStatus,
    remediationType,
    actionLevel,
  };
};

const cleanSdkState = (): V4MigrationSdkState => ({
  status: "latest",
  sdkUsageSeries: [],
  upgradeRequiredCount: 0,
  delayedOtelIngestionCount: 0,
});

const mocks = vi.hoisted(() => ({
  // Mutable so tests can flip between Cloud and self-hosted; the component
  // reads the env at render time.
  env: { NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "US" } as {
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: string | undefined;
  },
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
    ] as {
      endpoint: string;
      count: number;
      lastSeen: string;
      callers?: {
        sdkName?: "python" | "javascript";
        sdkVersion?: string;
        userAgent?: string;
        isOther?: true;
        count: number;
        lastSeen: string;
      }[];
    }[],
    legacyIntegrations: ["PostHog", "Mixpanel", "Blob Storage"],
  },
  canToggleV4: true,
  isV4: true,
  hasApiKeyCreateAccess: true,
  canUpdateOrgSettings: true,
  aiFeaturesEnabled: true,
  createProjectApiKey: vi.fn(),
}));

vi.mock("@/src/env.mjs", () => ({ env: mocks.env }));

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
  useIsInAppAgentLauncherVisible: () => true,
  useInAppAiAgent: () => ({
    openAssistant: mocks.openAssistant,
    submit: mocks.submitAgentMessage,
  }),
}));

// The toggle row pulls in session + tRPC state via useReadPath; stub it so the
// content tests need no SessionProvider or tRPC client.
vi.mock("@/src/features/events/components/V4SidebarToggle", () => ({
  V4PreviewToggleRow: () => null,
}));

// The details content reads canToggleV4 to gate the toggle section's copy.
vi.mock("@/src/features/events/hooks/useReadPath", () => ({
  useReadPath: () => ({
    canToggleV4: mocks.canToggleV4,
    isV4: mocks.isV4,
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
    mocks.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "US";
    mocks.routerPush.mockResolvedValue(true);
    mocks.submitAgentMessage.mockResolvedValue(undefined);
    mocks.migrationData.evals = { status: "loaded", count: 0 };
    mocks.migrationData.experiments = {
      status: "loaded",
      result: "not_required",
    };
    mocks.migrationData.experimentInstrumentationUpgradePath = null;
    mocks.canToggleV4 = true;
    mocks.isV4 = true;
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
    expect(screen.getByText("Migrate APIs")).toHaveClass("font-bold");
    expect(screen.getByText("Migrate Integrations")).toBeInTheDocument();
    expect(screen.queryByText("Legacy APIs")).not.toBeInTheDocument();
    expect(screen.queryByText("Legacy Integrations")).not.toBeInTheDocument();

    const endpointLink = screen.getByRole("link", {
      name: "GET /api/public/traces",
    });
    expect(endpointLink).toHaveAttribute(
      "href",
      "https://langfuse.com/faq/all/deprecated-api-migration",
    );
    expect(endpointLink).not.toHaveClass("font-bold");
    expect(within(endpointLink).getByText("traces")).toHaveClass("font-bold");
    expect(
      screen.getByTitle("Last seen at 2026-07-23T10:37:00Z"),
    ).toHaveTextContent(/42 calls · last seen/);

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

  it("rounds estimated API call counts and keeps positive usage visible", () => {
    mocks.migrationData.apiUsage = [
      {
        endpoint: "GET /api/public/traces",
        count: 56.5,
        lastSeen: "2026-07-23T10:37:00Z",
      },
      {
        endpoint: "GET /api/public/observations",
        count: 4.5,
        lastSeen: "2026-07-22T10:37:00Z",
      },
      {
        endpoint: "GET /api/public/traces/{id}",
        count: 1 / 3,
        lastSeen: "2026-07-21T10:37:00Z",
      },
    ];

    render(<V4MigrationDetailsContent projectId="project-1" />);

    expect(
      screen.getByTitle("Last seen at 2026-07-23T10:37:00Z"),
    ).toHaveTextContent(/57 calls · last seen/);
    expect(
      screen.getByTitle("Last seen at 2026-07-22T10:37:00Z"),
    ).toHaveTextContent(/5 calls · last seen/);
    expect(
      screen.getByTitle("Last seen at 2026-07-21T10:37:00Z"),
    ).toHaveTextContent(/1 call · last seen/);
  });

  it("shows the caller and exact SDK migration action", () => {
    mocks.migrationData.apiUsage = [
      {
        endpoint: "GET /api/public/traces/{id}",
        count: 4,
        lastSeen: "2026-07-23T10:37:00Z",
        callers: [
          {
            sdkName: "python" as const,
            sdkVersion: "3.9.0",
            userAgent: "langfuse-python/3.9.0",
            count: 3,
            lastSeen: "2026-07-23T10:37:00Z",
          },
          {
            userAgent: "codex-cli/1.2.3",
            count: 1,
            lastSeen: "2026-07-23T10:30:00Z",
          },
        ],
      },
    ];

    render(<V4MigrationDetailsContent projectId="project-1" />);

    expect(screen.getByText("Langfuse Python SDK 3.9.0")).toBeInTheDocument();
    expect(screen.getByText("client.api.trace.get")).toBeInTheDocument();
    expect(
      screen.getByText("client.api.observations.get_many"),
    ).toBeInTheDocument();
    expect(screen.getByText("4.0.0 or newer")).toBeInTheDocument();
    expect(screen.getByText("Codex")).toBeInTheDocument();
    expect(screen.getByText(/traffic from a coding agent/)).toBeInTheDocument();
    expect(screen.queryByText("User-Agent:")).not.toBeInTheDocument();
    expect(
      screen.queryByTitle("Last seen at 2026-07-23T10:37:00Z"),
    ).not.toBeInTheDocument();

    for (const callerName of ["Langfuse Python SDK 3.9.0", "Codex"]) {
      const caller = screen.getByText(callerName).closest("li");
      expect(caller).toHaveClass("bg-muted/50", "border-l-4", "p-2");
      expect(caller?.firstElementChild).toHaveTextContent(callerName);
      expect(caller?.firstElementChild).toHaveTextContent(/calls? · last seen/);
      expect(
        within(caller?.firstElementChild as HTMLElement).queryByRole("link"),
      ).not.toBeInTheDocument();
      const docsLink = within(caller!).getByRole("link", {
        name: "See docs.",
      });
      expect(docsLink).toHaveAttribute(
        "href",
        "https://langfuse.com/faq/all/deprecated-api-migration",
      );
      expect(docsLink.parentElement).toHaveTextContent(/See docs\.$/);
    }

    fireEvent.click(screen.getAllByRole("link", { name: "See docs." })[0]!);
    expect(mocks.capture).toHaveBeenCalledWith(
      "v4_migration:section_link_clicked",
      { section: "apis", link: "deprecated_api_caller_docs" },
    );
  });

  it("shows route totals without a caller section for unknown-only callers", () => {
    mocks.migrationData.apiUsage = [
      {
        endpoint: "GET /api/public/traces",
        count: 42,
        lastSeen: "2026-07-23T10:37:00Z",
        callers: [
          {
            isOther: true,
            count: 42,
            lastSeen: "2026-07-23T10:37:00Z",
          },
        ],
      },
    ];

    render(<V4MigrationDetailsContent projectId="project-1" />);

    expect(
      screen.getByTitle("Last seen at 2026-07-23T10:37:00Z"),
    ).toHaveTextContent(/42 calls · last seen/);
    expect(screen.queryByText("Unknown callers")).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("collapses clean sections into one up-to-date summary", () => {
    mocks.migrationData.apis = { status: "loaded", count: 0 };
    mocks.migrationData.exports = { status: "loaded", count: 0 };
    mocks.migrationData.apiUsage = [];
    mocks.migrationData.legacyIntegrations = [];

    render(<V4MigrationDetailsContent projectId="project-1" />);

    expect(
      screen.getByText(
        `SDK, instrumentation, experiment, and API checks cover activity from the last ${V4_MIGRATION_LOOKBACK_DAYS} days. API and experiment usage counts refresh about every 15 minutes, so recent calls may not appear yet.`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Evals, experiments, APIs and integrations are up to date.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Update Evals")).not.toBeInTheDocument();
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
      screen.queryByText("Update Evals", { exact: true }),
    ).not.toBeInTheDocument();
  });

  it("uses Update consistently for affected evals", () => {
    mocks.migrationData.evals = { status: "loaded", count: 2 };

    render(<V4MigrationDetailsContent projectId="project-1" />);

    fireEvent.click(screen.getByRole("button", { name: /Update Evals/ }));
    expect(
      screen.getByText(/Update them to target observations/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Repoint them/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Retarget them/)).not.toBeInTheDocument();
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
          source: "otel",
          sdkName: "otelcol",
          sdkVersion: "0.98.0",
          canonicalSdkName: null,
        }),
      ],
    };

    render(<V4MigrationDetailsContent projectId="project-1" />);

    expect(screen.queryByText("Update SDK")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Update OTel Instrumentation"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Detected V4-compatible instrumentation"),
    ).toBeInTheDocument();
    expect(screen.getByText("Python 4.7.1")).toBeInTheDocument();
    expect(screen.getByText("otelcol 0.98.0")).toBeInTheDocument();
    expect(screen.getByText("· up to date")).toBeInTheDocument();
    expect(screen.getByText("· real-time")).toBeInTheDocument();
  });

  it("lists only required SDK series in Update SDK and shows compatible ones as detected", () => {
    mocks.migrationData.sdk = {
      status: "legacy",
      sdkUsageSeries: [
        makeSdkUsageSeries({
          sdkVersion: "2.60.3",
        }),
        makeSdkUsageSeries({
          sdkVersion: "4.6.9",
          publicKey: "pk-lf-fedcba0987654321",
        }),
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
    expect(screen.getByText(/upgrade required/)).toBeInTheDocument();
    // Compatible current-major traffic lands in the detected section.
    expect(
      screen.getByText("Detected V4-compatible instrumentation"),
    ).toBeInTheDocument();
    expect(screen.getByText("Python 4.6.9")).toBeInTheDocument();
    expect(screen.getByText("· up to date")).toBeInTheDocument();
    expect(
      screen.queryByText("· recommended to upgrade to >= 4.7.0"),
    ).not.toBeInTheDocument();
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
          "ingestionSource;stringOptions;;any of;ingestion-api-dual-write," +
          "ingestionSdkName;stringOptions;;any of;python," +
          "ingestionSdkVersion;stringOptions;;any of;2.60.3",
      )}&dateRange=${V4_MIGRATION_LOOKBACK_DAYS}d`,
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

  it("hides Update SDK when every SDK series is already compatible", () => {
    mocks.migrationData.sdk = {
      status: "latest",
      sdkUsageSeries: [
        makeSdkUsageSeries({
          sdkVersion: "4.6.9",
        }),
      ],
      upgradeRequiredCount: 0,
      delayedOtelIngestionCount: 0,
    };

    render(<V4MigrationDetailsContent projectId="project-1" />);

    expect(screen.queryByText("Update SDK")).not.toBeInTheDocument();
    expect(screen.queryByText(/needs an update/)).not.toBeInTheDocument();
    expect(
      screen.getByText("Detected V4-compatible instrumentation"),
    ).toBeInTheDocument();
    expect(screen.getByText("Python 4.6.9")).toBeInTheDocument();
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
    expect(screen.getByText(/upgrade required/)).toBeInTheDocument();
    expect(screen.queryByText(/upgrade completed/)).not.toBeInTheDocument();
    // Compatible series are listed under the detected section, not Update SDK.
    expect(
      screen.getByText("Detected V4-compatible instrumentation"),
    ).toBeInTheDocument();
    expect(screen.getByText("Python 4.7.1")).toBeInTheDocument();
  });

  it("renders the key as plain text when an offender has no observation evidence", () => {
    // A series with no events_core rows: a link would open an empty table,
    // so the evidence link must stay hidden.
    mocks.migrationData.sdk = {
      status: "legacy",
      sdkUsageSeries: [
        makeSdkUsageSeries({
          sdkVersion: "2.60.3",
          eventCount: 0,
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
          source: "otel-dual-write",
          sdkName: "unknown",
          sdkVersion: "unknown",
          canonicalSdkName: null,
          publicKey: "",
        }),
      ],
      upgradeRequiredCount: 0,
      delayedOtelIngestionCount: 1,
    };

    render(<V4MigrationDetailsContent projectId="project-1" />);

    expect(screen.getByText("No API key")).toBeInTheDocument();
    expect(screen.getByText("Custom instrumentation")).toBeInTheDocument();
    const evidenceLink = screen.getByRole("link", {
      name: "View observations",
    });
    expect(evidenceLink).toHaveAttribute(
      "href",
      `/project/project-1/observations?filter=${encodeURIComponent(
        "ingestionApiKey;stringOptions;;any of;," +
          "ingestionSource;stringOptions;;any of;otel-dual-write",
      )}&dateRange=${V4_MIGRATION_LOOKBACK_DAYS}d`,
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

  it("shows delayed OTel exporters and moves realtime OTel to Detected", () => {
    mocks.migrationData.sdk = {
      status: "otel_header_required",
      sdkUsageSeries: [
        makeSdkUsageSeries({}),
        makeSdkUsageSeries({
          source: "otel-dual-write",
          sdkName: "openlit",
          sdkVersion: "1.35.4",
          canonicalSdkName: null,
          publicKey: "pk-lf-aaaa000011112222",
        }),
        makeSdkUsageSeries({
          source: "otel",
          sdkName: "otelcol",
          sdkVersion: "0.98.0",
          canonicalSdkName: null,
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
    expect(
      screen.getByText("x-langfuse-ingestion-version: 4").closest("p"),
    ).toHaveTextContent(
      "Your OpenTelemetry data is using delayed ingestion. For real-time ingestion, upgrade your integration or, if you use OpenTelemetry directly, set x-langfuse-ingestion-version: 4 on your OTLP exporter. Migration guide.",
    );
    expect(screen.getByText("openlit 1.35.4")).toBeInTheDocument();
    expect(screen.getByText("· delayed")).toBeInTheDocument();
    expect(screen.queryByText("Update SDK")).not.toBeInTheDocument();
    // Compatible SDK + realtime OTel land in the detected section.
    expect(
      screen.getByText("Detected V4-compatible instrumentation"),
    ).toBeInTheDocument();
    expect(screen.getByText("Python 4.7.1")).toBeInTheDocument();
    expect(screen.getByText("otelcol 0.98.0")).toBeInTheDocument();
    expect(screen.getByText("· real-time")).toBeInTheDocument();
  });

  it("keeps Update SDK visible for a recognized SDK with an unparsable version", () => {
    mocks.migrationData.sdk = {
      status: "unknown",
      sdkUsageSeries: [
        makeSdkUsageSeries({
          sdkVersion: "not-a-version",
          sdkVersionMajor: null,
          isValidSdkVersion: false,
          v4MigrationStatus: "unknown",
          actionLevel: "required",
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
    mocks.isV4 = false;
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
          source: "ingestion-api-dual-write",
          sdkName: "unknown",
          sdkVersion: "unknown",
          canonicalSdkName: null,
          attributionStatus: "missing_name_and_version",
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
        "ingestionApiKey;stringOptions;;any of;pk-lf-1234567890abcdef," +
          "ingestionSource;stringOptions;;any of;ingestion-api-dual-write",
      )}&dateRange=${V4_MIGRATION_LOOKBACK_DAYS}d`,
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

  it("omits a missing API key from custom instrumentation rows", () => {
    mocks.migrationData.sdk = {
      status: "unknown",
      sdkUsageSeries: [
        makeSdkUsageSeries({
          source: "ingestion-api-dual-write",
          sdkName: "unknown",
          sdkVersion: "unknown",
          canonicalSdkName: null,
          publicKey: "",
          attributionStatus: "missing_name_and_version",
        }),
      ],
      upgradeRequiredCount: 0,
      delayedOtelIngestionCount: 0,
    };

    render(<V4MigrationDetailsContent projectId="project-1" />);

    const row = screen.getByText("Custom instrumentation").closest("li")!;
    expect(within(row).queryByText("No API key")).not.toBeInTheDocument();
    expect(within(row).getByText(/last seen/)).toBeInTheDocument();
  });

  it("renders the agent upgrade group with the prompt CTA", () => {
    render(<V4MigrationDetailsContent projectId="project-1" />);

    expect(screen.getByText("Upgrade using coding agents")).toBeInTheDocument();
    expect(
      screen.getByText(/Paste prompt into Claude Code or other coding agents/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy prompt" }),
    ).toBeInTheDocument();
  });

  it("links the walkthrough video from the help footer on Cloud", () => {
    render(<V4MigrationDetailsContent projectId="project-1" />);

    const link = screen.getByRole("link", { name: "Walkthrough video" });
    // Straight to YouTube in a new tab; the panel never embeds the player,
    // so no iframe may render before or after the click.
    expect(link).toHaveAttribute(
      "href",
      "https://www.youtube.com/watch?v=g3YbbqVGt4g",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(document.querySelector("iframe")).toBeNull();

    fireEvent.click(link);
    expect(mocks.capture).toHaveBeenCalledWith(
      "v4_migration:walkthrough_video_clicked",
    );
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("hides the walkthrough video link on self-hosted deployments", () => {
    mocks.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    render(<V4MigrationDetailsContent projectId="project-1" />);

    expect(screen.queryByText("Walkthrough video")).not.toBeInTheDocument();
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
    // The panel entry point preselects the assistant: no choice screen.
    const migrationDialog = screen.getByRole("dialog");
    expect(
      within(migrationDialog).getByRole("heading", {
        name: "Ready to start your evaluator upgrade?",
      }),
    ).toBeInTheDocument();
    expect(
      within(migrationDialog).queryByRole("button", {
        name: /^Use Assistant/,
      }),
    ).not.toBeInTheDocument();
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

  it("keeps the choice screen when AI features are disabled", () => {
    mocks.migrationData.evals = { status: "loaded", count: 1 };
    mocks.aiFeaturesEnabled = false;

    render(<V4MigrationDetailsContent projectId="project-1" />);

    // Without AI features the button drops the assistant branding …
    expect(
      screen.queryByRole("button", { name: "Use Assistant" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Update evals" }));

    // … and the dialog does not preselect the assistant, so the choice
    // screen keeps owning the enable-AI flow.
    const migrationDialog = screen.getByRole("dialog");
    expect(
      within(migrationDialog).getByRole("heading", {
        name: "How would you like to upgrade your evaluators?",
      }),
    ).toBeInTheDocument();
    expect(
      within(migrationDialog).getByRole("button", {
        name: /^Use Assistant/,
      }),
    ).toBeInTheDocument();
  });

  it("shows the admin handoff after a non-admin chooses the Assistant", () => {
    mocks.migrationData.evals = { status: "loaded", count: 1 };
    mocks.canUpdateOrgSettings = false;
    mocks.aiFeaturesEnabled = false;

    render(<V4MigrationDetailsContent projectId="project-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Update evals" }));
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
    mocks.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "US";
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

  it("uses the project-independent compatibility title and requested description", () => {
    render(<V4MigrationHeaderContent readiness="action-needed" />);

    // The title stays off the version number: the app shell already shows a v4
    // build, so a "upgrade to v4" headline read as a contradiction.
    expect(
      screen.getByText("Ensure compatibility after November 16"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Upgrade to v4")).not.toBeInTheDocument();
    expect(screen.queryByText(/Project 1/)).not.toBeInTheDocument();
    expect(screen.getByText(/Langfuse v4 is live/)).toHaveTextContent(
      "Langfuse v4 is live: a re-architecture of our data model and database tables. It is up to 165× more performant in UI and on APIs. It also enables new features such as full-text search, a new filter search bar, alerts, code evaluators, and the Langfuse Assistant. Complete the action items below to avoid disruption. See docs.",
    );
    expect(
      screen.getByRole("link", { name: "full-text search" }),
    ).toHaveAttribute(
      "href",
      "https://langfuse.com/docs/observability/features/full-text-search",
    );
    expect(
      screen.getByRole("link", { name: "new filter search bar" }),
    ).toHaveAttribute(
      "href",
      "https://langfuse.com/docs/observability/features/filter-search-bar",
    );
    expect(screen.getByRole("link", { name: "alerts" })).toHaveAttribute(
      "href",
      "https://langfuse.com/docs/metrics/features/alerts",
    );
    expect(
      screen.getByRole("link", { name: "code evaluators" }),
    ).toHaveAttribute(
      "href",
      "https://langfuse.com/docs/evaluation/evaluation-methods/code-evaluators",
    );
    expect(
      screen.getByRole("link", { name: "Langfuse Assistant" }),
    ).toHaveAttribute("href", "https://langfuse.com/docs/langfuse-assistant");
    expect(screen.getByRole("link", { name: "See docs." })).toHaveAttribute(
      "href",
      "https://langfuse.com/docs/v4",
    );
    expect(
      screen.getByText(/some features may stop working/),
    ).toHaveTextContent(
      "After November 16, 2026 some features may stop working if you don't update integrations.",
    );
    expect(
      screen.getByRole("link", { name: "November 16, 2026" }),
    ).toHaveAttribute("href", "https://langfuse.com/docs/v4#timeline");
  });

  it("drops the dated deadline for self-hosted deployments", () => {
    // The date is a Cloud commitment: a self-hosted deployment keeps its legacy
    // surfaces until its own operator moves the write mode off dual.
    mocks.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;

    render(<V4MigrationHeaderContent readiness="action-needed" />);

    expect(screen.getByText("Ensure compatibility")).toBeInTheDocument();
    expect(screen.getByText(/features may stop working/)).toHaveTextContent(
      "Some features may stop working if you don't update integrations before your administrator disables the legacy mode.",
    );
    expect(screen.queryByText(/November 16/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "November 16, 2026" }),
    ).not.toBeInTheDocument();
  });

  it("reserves a close-button gutter on the title row when the host asks", () => {
    // The modal host floats the dialog's fallback close button over the
    // body's top-right corner; without the gutter it overlaps the title.
    render(<V4MigrationHeaderContent titleRowClassName="pr-6" />);
    expect(
      screen.getByText("Ensure compatibility after November 16").parentElement,
    ).toHaveClass("pr-6");
  });

  it("keeps the pitch but drops the action ask for ready or unresolved projects", () => {
    for (const readiness of [
      "ready",
      "checking",
      "unavailable",
      undefined,
    ] as const) {
      const { unmount } = render(
        <V4MigrationHeaderContent readiness={readiness} />,
      );

      expect(
        screen.queryByText(/Complete the action items below/),
      ).not.toBeInTheDocument();
      expect(screen.getByText(/Langfuse v4 is live/)).toBeInTheDocument();
      expect(
        screen.queryByText(/some features may stop working/),
      ).not.toBeInTheDocument();
      unmount();
    }
  });

  it("labels the help footer and groups content with three separators", () => {
    const { container } = render(
      <V4MigrationDetailsContent projectId="project-1" />,
    );

    expect(screen.getByText("Need help?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute(
      "href",
      "https://langfuse.com/docs/v4",
    );
    // One divider above Action items, one above the agent CTA, one above
    // Need help. Decorative Radix separators render role="none", so query
    // by data attribute.
    expect(
      container.querySelectorAll('[data-orientation="horizontal"]'),
    ).toHaveLength(3);
  });

  it("shows the prompt without any click and copies it in a single click", () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn() } });
    render(<V4MigrationAgentUpgradeSection projectId="project-1" />);

    // The prompt is always visible; no reveal step required.
    expect(screen.getByText("coding-agent-prompt")).toBeInTheDocument();
    expect(mocks.createProjectApiKey).not.toHaveBeenCalled();

    // A single CTA click copies; still no credentials. (jsdom has no clipboard.)
    fireEvent.click(screen.getByRole("button", { name: "Copy prompt" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "coding-agent-prompt",
    );
    expect(mocks.createProjectApiKey).not.toHaveBeenCalled();
  });

  it("creates keys only on the explicit create action and shows an env block", async () => {
    render(<V4MigrationAgentUpgradeSection projectId="project-1" />);

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
