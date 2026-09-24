// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { V4MigrationPanel } from "./V4MigrationPanel";
import type { ProjectMigrationStatus } from "./migrationData";

const mocks = vi.hoisted(() => ({
  migrationData: {
    sdk: {
      status: "checking" as const,
      sdkUsageSeries: [],
      upgradeRequiredCount: 0,
      delayedOtelIngestionCount: 0,
    },
    evals: { status: "loading" as const, count: 0 },
    experiments: { status: "loading" as const, result: null },
    apis: { status: "loading" as const, count: 0 },
    exports: { status: "loading" as const, count: 0 },
    forceV3Experience: false,
  } as ProjectMigrationStatus,
}));

vi.mock("@/src/features/v4-migration/V4MigrationPanelProvider", () => ({
  useV4MigrationPanel: () => ({
    open: true,
    setOpen: vi.fn(),
    targetProject: {
      id: "project-id",
      name: "Project",
      readiness: "checking",
    },
  }),
}));

vi.mock("@/src/features/projects/hooks", () => ({
  useQueryProject: () => ({ project: null }),
  useProject: () => ({ organization: { id: "org-id" } }),
}));

vi.mock("@/src/features/v4-migration/hooks/useV4MigrationData", () => ({
  useProjectV4MigrationData: () => mocks.migrationData,
}));

vi.mock("@/src/features/v4-migration/V4MigrationContent", () => ({
  V4MigrationHeaderContent: ({ readiness }: { readiness?: string }) => (
    <div data-testid="readiness">{readiness ?? "unknown"}</div>
  ),
  V4MigrationDetailsContent: () => <div>Details</div>,
}));

describe("V4MigrationPanel", () => {
  it("refreshes header readiness when pending checks become actionable", () => {
    const { rerender } = render(<V4MigrationPanel />);
    expect(screen.getByTestId("readiness")).toHaveTextContent("checking");

    mocks.migrationData = {
      ...mocks.migrationData,
      sdk: {
        ...mocks.migrationData.sdk,
        status: "latest",
      },
      evals: { status: "loaded", count: 1 },
      experiments: { status: "loaded", result: "not_required" },
      apis: { status: "loaded", count: 0 },
      exports: { status: "loaded", count: 0 },
    };
    rerender(<V4MigrationPanel />);

    expect(screen.getByTestId("readiness")).toHaveTextContent("action-needed");
  });
});
