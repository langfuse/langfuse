// @vitest-environment jsdom

import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  SupportDrawerProvider,
  useSupportDrawer,
} from "@/src/features/support-chat/SupportDrawerProvider";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SupportDrawerProvider>{children}</SupportDrawerProvider>
);

describe("SupportDrawerProvider", () => {
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

  it("seeds the form message on closed→open only", () => {
    const { result } = renderHook(() => useSupportDrawer(), { wrapper });

    act(() => result.current.setOpen(true, { message: "Error ID: abc123" }));
    const epoch = result.current.openEpoch;
    expect(result.current.initialMessage).toBe("Error ID: abc123");

    // Reporting a second error while open must not wipe the draft.
    act(() => result.current.setOpen(true, { message: "Error ID: def456" }));
    expect(result.current.openEpoch).toBe(epoch);
    expect(result.current.initialMessage).toBe("Error ID: abc123");

    act(() => result.current.setOpen(false));
    act(() => result.current.setOpen(true));
    expect(result.current.initialMessage).toBe("");
  });
});
