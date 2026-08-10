import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { V4MigrationEvaluatorUpdateRequiredBadge } from "./V4MigrationDelayBadge";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  capture: vi.fn(),
  v4UpgradeUiEnabled: true,
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => mocks.capture,
}));

vi.mock("@/src/features/v4-migration/useV4UpgradeUiEnabled", () => ({
  useV4UpgradeUiEnabled: () => mocks.v4UpgradeUiEnabled,
}));

describe("V4MigrationEvaluatorUpdateRequiredBadge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.v4UpgradeUiEnabled = true;
  });

  it("opens the manual upgrade flow directly", () => {
    render(
      <V4MigrationEvaluatorUpdateRequiredBadge
        projectId="project-1"
        evaluatorId="evaluator-1"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Upgrade now" }));

    expect(mocks.capture).toHaveBeenCalledWith(
      "v4_migration:update_required_badge_clicked",
      { scope: "single" },
    );
    expect(mocks.push).toHaveBeenCalledWith(
      "/project/project-1/evals/remap?evaluator=evaluator-1",
    );
  });

  it("stays hidden when the v4 upgrade UI is disabled", () => {
    mocks.v4UpgradeUiEnabled = false;

    render(
      <V4MigrationEvaluatorUpdateRequiredBadge
        projectId="project-1"
        evaluatorId="evaluator-1"
      />,
    );

    expect(screen.queryByRole("button", { name: "Upgrade now" })).toBeNull();
  });
});
