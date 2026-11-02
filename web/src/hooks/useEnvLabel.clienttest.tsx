import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useEnvLabel } from "@/src/hooks/useEnvLabel";

const mocks = vi.hoisted(() => ({
  email: "someone@langfuse.com" as string | undefined,
  region: "EU" as string | undefined,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { email: mocks.email } } }),
}));

vi.mock("@/src/features/organizations", () => ({
  useLangfuseCloudRegion: () =>
    mocks.region === undefined
      ? ({ isLangfuseCloud: false, region: undefined } as const)
      : ({ isLangfuseCloud: true, region: mocks.region } as const),
}));

const dismissBadge = (label: ReturnType<typeof useEnvLabel>) => {
  if (!label.visible) throw new Error("expected the badge to be visible");
  label.dismiss();
};

// #18871: dismissal used to be `useState` inside the hook, so the badge came
// back on the next navigation. The screenshot use case it exists for wants it
// to stay gone, which is what these assertions pin.
describe("useEnvLabel", () => {
  beforeEach(() => {
    mocks.email = "someone@langfuse.com";
    mocks.region = "EU";
    sessionStorage.clear();
  });

  it("shows the badge to Langfuse staff on cloud", () => {
    const { result } = renderHook(() => useEnvLabel());

    expect(result.current).toMatchObject({ visible: true, region: "EU" });
  });

  it("keeps the badge hidden after a dismissal, across remounts", () => {
    const first = renderHook(() => useEnvLabel());

    act(() => dismissBadge(first.result.current));
    expect(first.result.current.visible).toBe(false);
    first.unmount();

    const second = renderHook(() => useEnvLabel());
    expect(second.result.current.visible).toBe(false);
  });

  it("scopes the dismissal to the tab so a fresh session shows the badge again", () => {
    const { result } = renderHook(() => useEnvLabel());
    act(() => dismissBadge(result.current));

    expect(sessionStorage.getItem("langfuse-env-label-hidden")).toBe("true");

    sessionStorage.clear();
    expect(renderHook(() => useEnvLabel()).result.current.visible).toBe(true);
  });

  it("stays hidden for self-hosted and for non-staff accounts", () => {
    mocks.region = undefined;
    expect(renderHook(() => useEnvLabel()).result.current.visible).toBe(false);

    mocks.region = "EU";
    mocks.email = "someone@example.com";
    expect(renderHook(() => useEnvLabel()).result.current.visible).toBe(false);
  });
});
