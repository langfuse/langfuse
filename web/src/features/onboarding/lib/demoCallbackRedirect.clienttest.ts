import { afterEach, describe, expect, it, vi } from "vitest";

const { envState } = vi.hoisted(() => ({
  envState: { NEXT_PUBLIC_BASE_PATH: undefined as string | undefined },
}));

vi.mock("@/src/env.mjs", () => ({ env: envState }));

import {
  getDeepLinkCallbackRedirectPath,
  getSignupCallbackUrl,
} from "@/src/features/onboarding/lib/demoCallbackRedirect";

const DEEP_LINK = "/project/p1/traces/t1?observation=o1#trace-o1";

afterEach(() => {
  envState.NEXT_PUBLIC_BASE_PATH = undefined;
});

describe("getDeepLinkCallbackRedirectPath", () => {
  it("keeps a relative deep link with its query", () => {
    expect(getDeepLinkCallbackRedirectPath(DEEP_LINK)).toBe(DEEP_LINK);
  });

  it("keeps the same-origin absolute URL NextAuth passes to newUser", () => {
    expect(
      getDeepLinkCallbackRedirectPath(`${window.location.origin}${DEEP_LINK}`),
    ).toBe(DEEP_LINK);
  });

  it.each([
    ["the root", "/"],
    ["the sign-in page (the SSO button's default)", "/auth/sign-in"],
    ["the step itself", "/onboarding"],
  ])("ignores %s", (_, path) => {
    expect(
      getDeepLinkCallbackRedirectPath(`${window.location.origin}${path}`),
    ).toBeUndefined();
  });

  it.each([
    ["another origin", "https://evil.example/project/p1"],
    ["a protocol-relative URL", "//evil.example/project/p1"],
    ["a script URL", "javascript:alert(1)"],
    ["a repeated query param", ["/project/p1", "/project/p2"]],
  ])("ignores %s", (_, value) => {
    expect(getDeepLinkCallbackRedirectPath(value)).toBeUndefined();
  });

  it("strips the base path, which the router adds again", () => {
    envState.NEXT_PUBLIC_BASE_PATH = "/langfuse";
    expect(
      getDeepLinkCallbackRedirectPath(
        `${window.location.origin}/langfuse${DEEP_LINK}`,
      ),
    ).toBe(DEEP_LINK);
  });
});

describe("getSignupCallbackUrl", () => {
  it("sends a self-hosted deep link through the step", () => {
    expect(
      getSignupCallbackUrl({ targetPath: DEEP_LINK, isLangfuseCloud: false }),
    ).toBe(`/onboarding?targetPath=${encodeURIComponent(DEEP_LINK)}`);
  });

  it.each([undefined, "/"])(
    "sends a self-hosted sign-up without a deep link (%s) to the step",
    (targetPath) => {
      expect(getSignupCallbackUrl({ targetPath, isLangfuseCloud: false })).toBe(
        "/onboarding",
      );
    },
  );

  it("keeps the base path on the step and strips it from the deep link", () => {
    envState.NEXT_PUBLIC_BASE_PATH = "/langfuse";
    expect(
      getSignupCallbackUrl({
        targetPath: `/langfuse${DEEP_LINK}`,
        isLangfuseCloud: false,
      }),
    ).toBe(`/langfuse/onboarding?targetPath=${encodeURIComponent(DEEP_LINK)}`);
  });

  it.each([
    ["a demo path", "/demo", "/onboarding?targetPath=%2Fdemo"],
    ["another deep link", DEEP_LINK, DEEP_LINK],
    ["no target path", undefined, "/onboarding"],
  ])("keeps Cloud's handling of %s", (_, targetPath, expected) => {
    expect(getSignupCallbackUrl({ targetPath, isLangfuseCloud: true })).toBe(
      expected,
    );
  });
});
