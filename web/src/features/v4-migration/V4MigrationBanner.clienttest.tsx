import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { V4MigrationBanner } from "./V4MigrationBanner";
import { type ProjectMigrationStatus } from "./migrationData";

const mocks = vi.hoisted(() => ({
  statusByProjectId: new Map<string, object>(),
  organizationsArg: undefined as unknown,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        organizations: [
          {
            id: "org-1",
            name: "Org 1",
            projects: [
              { id: "project-1", name: "Project 1", deletedAt: null },
              { id: "project-deleted", name: "Deleted", deletedAt: new Date() },
            ],
          },
          {
            id: "demo-org",
            name: "Demo",
            projects: [{ id: "demo-project", name: "Demo", deletedAt: null }],
          },
        ],
      },
    },
  }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/env.mjs", () => ({
  env: { NEXT_PUBLIC_DEMO_ORG_ID: "demo-org" },
}));

vi.mock("@/src/features/v4-migration/hooks/useV4MigrationData", () => ({
  useAccountV4MigrationData: (params: { organizations: unknown }) => {
    mocks.organizationsArg = params.organizations;
    return mocks.statusByProjectId;
  },
}));

const status = (
  overrides?: Partial<ProjectMigrationStatus>,
): ProjectMigrationStatus => ({
  sdk: {
    status: "latest",
    sdkUsageSeries: [],
    upgradeRequiredCount: 0,
    delayedOtelIngestionCount: 0,
  },
  evals: { status: "loaded", count: 0 },
  experiments: { status: "loaded", result: "not_required" },
  apis: { status: "loaded", count: 0 },
  exports: { status: "loaded", count: 0 },
  ...overrides,
});

describe("V4MigrationBanner", () => {
  beforeEach(() => {
    mocks.statusByProjectId = new Map();
  });

  it("shows while the only project still needs migration work", () => {
    mocks.statusByProjectId.set(
      "project-1",
      status({ evals: { status: "loaded", count: 2 } }),
    );
    render(<V4MigrationBanner />);
    expect(
      screen.getByText(/Your project needs an upgrade/),
    ).toBeInTheDocument();
  });

  it("says all projects need an upgrade only when they all do", () => {
    mocks.statusByProjectId.set(
      "project-1",
      status({ evals: { status: "loaded", count: 2 } }),
    );
    mocks.statusByProjectId.set(
      "project-2",
      status({ apis: { status: "loaded", count: 1 } }),
    );
    render(<V4MigrationBanner />);
    expect(
      screen.getByText(/All projects need an upgrade/),
    ).toBeInTheDocument();
  });

  it("counts the projects needing an upgrade in mixed accounts", () => {
    mocks.statusByProjectId.set(
      "project-1",
      status({ evals: { status: "loaded", count: 2 } }),
    );
    mocks.statusByProjectId.set("project-2", status());
    render(<V4MigrationBanner />);
    expect(
      screen.getByText(/1 of your 2 projects needs an upgrade/),
    ).toBeInTheDocument();
  });

  it("hides once every project is ready", () => {
    mocks.statusByProjectId.set("project-1", status());
    render(<V4MigrationBanner />);
    expect(screen.queryByText(/an upgrade/)).not.toBeInTheDocument();
  });

  it("hides while readiness is still being checked", () => {
    mocks.statusByProjectId.set(
      "project-1",
      status({ evals: { status: "loading", count: 0 } }),
    );
    render(<V4MigrationBanner />);
    expect(screen.queryByText(/an upgrade/)).not.toBeInTheDocument();
  });

  it("excludes the demo org and deleted projects from the queried scope", () => {
    mocks.statusByProjectId.set("project-1", status());
    render(<V4MigrationBanner />);
    expect(mocks.organizationsArg).toEqual([
      {
        id: "org-1",
        name: "Org 1",
        projects: [{ id: "project-1", name: "Project 1" }],
      },
    ]);
  });
});
