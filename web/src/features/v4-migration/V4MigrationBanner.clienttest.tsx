import { render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  V4MigrationBanner,
  useV4MigrationBannerState,
} from "./V4MigrationBanner";
import { type ProjectMigrationStatus } from "./migrationData";

const mocks = vi.hoisted(() => ({
  statusByProjectId: new Map<string, ProjectMigrationStatus>(),
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
  forceV3Experience: false,
  ...overrides,
});

describe("V4MigrationBanner", () => {
  beforeEach(() => {
    mocks.statusByProjectId = new Map();
  });

  it("shows while the only project still needs migration work", () => {
    render(
      <V4MigrationBanner projectsNeedingMigration={1} totalProjects={1} />,
    );
    expect(
      screen.getByText(/Your project needs an upgrade/),
    ).toBeInTheDocument();
  });

  it("says all projects need an upgrade only when they all do", () => {
    render(
      <V4MigrationBanner projectsNeedingMigration={2} totalProjects={2} />,
    );
    expect(
      screen.getByText(/All projects need an upgrade/),
    ).toBeInTheDocument();
  });

  it("counts the projects needing an upgrade in mixed accounts", () => {
    render(
      <V4MigrationBanner projectsNeedingMigration={1} totalProjects={2} />,
    );
    expect(
      screen.getByText(/1 of your 2 projects needs an upgrade/),
    ).toBeInTheDocument();
  });

  it("returns no migration work once every project is ready", () => {
    mocks.statusByProjectId.set("project-1", status());

    const { result } = renderHook(() => useV4MigrationBannerState(true));

    expect(result.current).toEqual({
      projectsNeedingMigration: 0,
      totalProjects: 1,
    });
  });

  it("returns no migration work while readiness is still being checked", () => {
    mocks.statusByProjectId.set(
      "project-1",
      status({ evals: { status: "loading", count: 0 } }),
    );

    const { result } = renderHook(() => useV4MigrationBannerState(true));

    expect(result.current.projectsNeedingMigration).toBe(0);
  });

  it("excludes the demo org and deleted projects from the queried scope", () => {
    renderHook(() => useV4MigrationBannerState(true));

    expect(mocks.organizationsArg).toEqual([
      {
        id: "org-1",
        name: "Org 1",
        projects: [{ id: "project-1", name: "Project 1" }],
      },
    ]);
  });
});
