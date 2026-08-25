import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuthSpan, mockInstrumentAsync } = vi.hoisted(() => {
  const mockAuthSpan = {
    setAttributes: vi.fn(),
  };

  return {
    mockAuthSpan,
    mockInstrumentAsync: vi.fn(
      async (
        _options: unknown,
        callback: (span: typeof mockAuthSpan) => unknown,
      ) => callback(mockAuthSpan),
    ),
  };
});

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  instrumentAsync: mockInstrumentAsync,
}));

vi.mock("@/src/ee/features/multi-tenant-sso/utils", () => ({
  findMultiTenantSsoConfig: vi.fn(),
  getSsoAuthProviderIdForDomain: vi.fn(),
  loadSsoProviders: vi.fn().mockResolvedValue([]),
}));

import { getAuthOptions } from "@/src/server/auth";

describe("next-auth sign-in span attributes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not attach the user email to the sign-in span", async () => {
    const authOptions = await getAuthOptions();
    const signIn = authOptions.callbacks?.signIn;
    if (!signIn) throw new Error("Expected a sign-in callback");

    await signIn({
      user: { id: "user-1", email: "user@example.com" },
      account: null,
      profile: undefined,
      email: undefined,
      credentials: undefined,
    });

    expect(mockAuthSpan.setAttributes).not.toHaveBeenCalledWith(
      expect.objectContaining({
        "auth.email": "user@example.com",
      }),
    );
  });
});
