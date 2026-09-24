// @vitest-environment node

import { signOutCleanly } from "@/src/features/auth/lib/signOut";

const { signOutMock, clearMock, sessionStorageClear } = vi.hoisted(() => ({
  signOutMock: vi.fn(async () => undefined),
  clearMock: vi.fn(),
  sessionStorageClear: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  signOut: signOutMock,
}));

vi.mock("posthog-js", () => ({
  default: { reset: vi.fn() },
}));

vi.mock("@/src/env.mjs", () => ({ env: {} }));

vi.mock("@/src/utils/sentryV4BetaTag", () => ({
  clearV4BetaEnabledSentryTag: clearMock,
}));

describe("signOutCleanly", () => {
  beforeEach(() => {
    signOutMock.mockClear();
    clearMock.mockClear();
    sessionStorageClear.mockClear();
    vi.stubGlobal("sessionStorage", { clear: sessionStorageClear });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("clears the v4 pageload cache before NextAuth redirects", async () => {
    await signOutCleanly();

    expect(clearMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(clearMock.mock.invocationCallOrder[0]).toBeLessThan(
      signOutMock.mock.invocationCallOrder[0],
    );
  });
});
