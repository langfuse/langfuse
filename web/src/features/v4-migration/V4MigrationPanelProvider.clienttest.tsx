// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { vi } from "vitest";

import {
  V4MigrationPanelProvider,
  useV4MigrationPanel,
} from "./V4MigrationPanelProvider";

const flagState = vi.hoisted(() => ({ enabled: false }));

vi.mock("./useV4UpgradeUiEnabled", () => ({
  useV4UpgradeUiEnabled: () => flagState.enabled,
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <V4MigrationPanelProvider>{children}</V4MigrationPanelProvider>
);

describe("V4MigrationPanelProvider", () => {
  beforeEach(() => {
    flagState.enabled = false;
  });

  it("refuses to open when the user flag is disabled", () => {
    const { result } = renderHook(() => useV4MigrationPanel(), { wrapper });

    act(() =>
      result.current.openForProject({ id: "project-id", name: "Project" }),
    );
    act(() => result.current.setOpen(true));

    expect(result.current.open).toBe(false);
    expect(result.current.targetProject).toBeNull();
  });

  it("opens for a project when the user flag is enabled", () => {
    flagState.enabled = true;
    const { result } = renderHook(() => useV4MigrationPanel(), { wrapper });

    act(() =>
      result.current.openForProject({ id: "project-id", name: "Project" }),
    );

    expect(result.current.open).toBe(true);
    expect(result.current.targetProject).toEqual({
      id: "project-id",
      name: "Project",
    });
  });
});
