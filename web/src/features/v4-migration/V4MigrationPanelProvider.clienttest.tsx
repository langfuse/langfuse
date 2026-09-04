// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { vi } from "vitest";

import {
  registerExclusiveRightPanel,
  resetExclusiveRightPanelsForTests,
} from "@/src/components/layouts/app-layout/right-drawer/exclusiveRightPanels";
import {
  V4MigrationPanelProvider,
  useV4MigrationPanel,
} from "./V4MigrationPanelProvider";

const flagState = vi.hoisted(() => ({ enabled: false }));
const captureMock = vi.hoisted(() => vi.fn());

vi.mock("./useV4UpgradeUiEnabled", () => ({
  useV4UpgradeUiEnabled: () => flagState.enabled,
}));

vi.mock("@/src/features/projects/hooks", () => ({
  useQueryProject: () => ({ project: null, organization: null }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => captureMock,
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <V4MigrationPanelProvider>{children}</V4MigrationPanelProvider>
);

describe("V4MigrationPanelProvider", () => {
  beforeEach(() => {
    flagState.enabled = false;
    captureMock.mockClear();
    resetExclusiveRightPanelsForTests();
  });

  it("closes the assistant when the migration panel opens", () => {
    flagState.enabled = true;
    const closeAssistant = vi.fn();
    registerExclusiveRightPanel("assistant", closeAssistant);
    const { result } = renderHook(() => useV4MigrationPanel(), { wrapper });

    act(() =>
      result.current.openForProject(
        { id: "project-id", name: "Project" },
        "sidebar_card",
      ),
    );

    expect(closeAssistant).toHaveBeenCalledTimes(1);
  });

  it("refuses to open when the user flag is disabled", () => {
    const { result } = renderHook(() => useV4MigrationPanel(), { wrapper });

    act(() =>
      result.current.openForProject(
        { id: "project-id", name: "Project" },
        "delay_badge",
      ),
    );
    act(() => result.current.setOpen(true));

    expect(result.current.open).toBe(false);
    expect(result.current.targetProject).toBeNull();
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("opens for a project when the user flag is enabled", () => {
    flagState.enabled = true;
    const { result } = renderHook(() => useV4MigrationPanel(), { wrapper });

    act(() =>
      result.current.openForProject(
        { id: "project-id", name: "Project" },
        "delay_badge",
      ),
    );

    expect(result.current.open).toBe(true);
    expect(result.current.targetProject).toEqual({
      id: "project-id",
      name: "Project",
      readiness: "action-needed",
    });
    expect(captureMock).toHaveBeenCalledExactlyOnceWith(
      "v4_migration:panel_opened",
      { source: "delay_badge" },
    );
  });

  it("reports one panel_opened per closed-to-open transition", () => {
    flagState.enabled = true;
    const { result } = renderHook(() => useV4MigrationPanel(), { wrapper });

    act(() =>
      result.current.openForProject(
        { id: "project-id", name: "Project" },
        "delay_badge",
      ),
    );
    // Redundant open of the SAME project from another surface: no new entry.
    act(() =>
      result.current.openForProject(
        { id: "project-id", name: "Project" },
        "sidebar_card",
      ),
    );

    const openedCalls = captureMock.mock.calls.filter(
      ([name]) => name === "v4_migration:panel_opened",
    );
    expect(openedCalls).toHaveLength(1);

    // Retargeting the open panel to a DIFFERENT project is a new entry.
    act(() =>
      result.current.openForProject(
        { id: "project-2", name: "Other project" },
        "status_page_row",
      ),
    );
    expect(
      captureMock.mock.calls.filter(
        ([name]) => name === "v4_migration:panel_opened",
      ),
    ).toHaveLength(2);

    // Close and reopen: a fresh funnel entry with the new source.
    act(() => result.current.setOpen(false));
    act(() =>
      result.current.openForProject(
        { id: "project-id", name: "Project" },
        "status_page_row",
      ),
    );
    expect(captureMock).toHaveBeenCalledWith("v4_migration:panel_opened", {
      source: "status_page_row",
    });
  });
});
