import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import V4MigrationStatusPage from "./V4MigrationStatusPage";

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    status: "authenticated",
    data: {
      user: {
        organizations: [
          {
            id: "org-1",
            name: "Test organization",
            projects: [
              {
                id: "project-1",
                name: "Test project",
                deletedAt: null,
              },
            ],
          },
        ],
      },
    },
  }),
}));

vi.mock("@/src/components/layouts/container-page", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/src/features/support-chat/SupportDrawerProvider", () => ({
  useSupportDrawer: () => ({ setOpen: vi.fn() }),
}));

vi.mock("@/src/features/v4-migration/V4MigrationPanelProvider", () => ({
  useV4MigrationPanel: () => ({ openForProject: vi.fn() }),
}));

vi.mock(
  "@/src/ee/features/in-app-agent/components/InAppAiAgentProvider",
  () => ({
    useInAppAiAgent: () => ({ setOpen: vi.fn() }),
  }),
);

vi.mock("@/src/features/v4-migration/V4MigrationContent", () => ({
  useCopyMigrationPrompt: () => vi.fn(),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/features/v4-migration/useV4UpgradeUiEnabled", () => ({
  useV4UpgradeUiEnabled: () => true,
}));

vi.mock("@/src/features/v4-migration/hooks/useV4MigrationData", () => ({
  useAccountV4MigrationData: () =>
    new Map([
      [
        "project-1",
        {
          sdk: "latest",
          evals: { status: "loaded", count: 0 },
          apis: { status: "loaded", count: 0 },
          exports: { status: "loaded", count: 0 },
        },
      ],
    ]),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    organizations: {
      lastTraceByProject: {
        useQuery: () => ({ data: [] }),
      },
    },
  },
}));

describe("V4MigrationStatusPage", () => {
  it("keeps the project table readable through horizontal scrolling", () => {
    render(<V4MigrationStatusPage />);

    const table = screen.getByRole("table");
    expect(table).toHaveClass("min-w-[60rem]", "table-auto");
    expect(table.parentElement).toHaveClass("overflow-x-auto");
  });
});
