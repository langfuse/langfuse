// @vitest-environment jsdom

import { beforeEach, describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  SupportDrawerProvider,
  useSupportDrawer,
} from "@/src/features/support-chat/SupportDrawerProvider";
import {
  TraceliftProvider,
  useTracelift,
} from "@/src/features/tracelift/TraceliftContext";

const traceliftScope = vi.hoisted(() => ({
  projectId: "project-1",
  enabled: true,
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ query: { projectId: traceliftScope.projectId } }),
}));

vi.mock("@/src/features/feature-flags", () => ({
  useInternalFeaturesEnabled: () => traceliftScope.enabled,
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <TraceliftProvider>
    <SupportDrawerProvider>{children}</SupportDrawerProvider>
  </TraceliftProvider>
);

describe("SupportDrawerProvider", () => {
  beforeEach(() => {
    traceliftScope.projectId = "project-1";
    traceliftScope.enabled = true;
  });

  it("does not restore Tracelift after leaving a project or disabling internal features", () => {
    const { result, rerender } = renderHook(() => useTracelift(), { wrapper });
    act(() => result.current.setOpen(true));
    traceliftScope.projectId = "project-2";
    rerender();
    expect(result.current.open).toBe(false);
    traceliftScope.projectId = "project-1";
    rerender();
    expect(result.current.open).toBe(false);

    act(() => result.current.setOpen(true));
    traceliftScope.enabled = false;
    rerender();
    expect(result.current.open).toBe(false);
    traceliftScope.enabled = true;
    rerender();
    expect(result.current.open).toBe(false);
  });

  it.each(["setOpen", "openWithMode"] as const)(
    "%s closes Tracelift when opening support",
    (action) => {
      const { result } = renderHook(
        () => ({ support: useSupportDrawer(), tracelift: useTracelift() }),
        { wrapper },
      );
      act(() => result.current.tracelift.setOpen(true));
      act(() => {
        if (action === "setOpen") result.current.support.setOpen(true);
        else result.current.support.openWithMode("form");
      });

      expect(result.current.support.open).toBe(true);
      expect(result.current.tracelift.open).toBe(false);
    },
  );
  it("bumps openEpoch and reseeds on closed→open", () => {
    const { result } = renderHook(() => useSupportDrawer(), { wrapper });
    const epochBefore = result.current.openEpoch;

    act(() => result.current.openWithMode("form", { topic: "V4 Migration" }));
    act(() => result.current.setOpen(false));
    act(() => result.current.setOpen(true));

    expect(result.current.open).toBe(true);
    expect(result.current.openEpoch).toBe(epochBefore + 2);
    expect(result.current.initialMode).toBe("intro");
    expect(result.current.initialTopic).toBeNull();
  });

  it("does not reset a drawer that is already open", () => {
    const { result } = renderHook(() => useSupportDrawer(), { wrapper });

    act(() => result.current.openWithMode("form", { topic: "V4 Migration" }));
    const epochWhileOpen = result.current.openEpoch;

    // A redundant open (e.g. clicking the support button again) must not
    // remount the drawer and wipe an in-progress draft.
    act(() => result.current.setOpen(true));

    expect(result.current.openEpoch).toBe(epochWhileOpen);
    expect(result.current.initialMode).toBe("form");
    expect(result.current.initialTopic).toBe("V4 Migration");
  });

  it("openWithMode always reseeds, even while open", () => {
    const { result } = renderHook(() => useSupportDrawer(), { wrapper });

    act(() => result.current.setOpen(true));
    const epoch = result.current.openEpoch;

    act(() => result.current.openWithMode("form"));

    expect(result.current.openEpoch).toBe(epoch + 1);
    expect(result.current.initialMode).toBe("form");
  });
});
