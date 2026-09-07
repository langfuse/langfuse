import { renderHook } from "@testing-library/react";
import { useSession } from "next-auth/react";

import useIsFeatureEnabled from "./useIsFeatureEnabled";

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
}));

const mockSession = ({
  llmGateway,
  admin = false,
  enableExperimentalFeatures = false,
}: {
  llmGateway: boolean;
  admin?: boolean;
  enableExperimentalFeatures?: boolean;
}) => {
  vi.mocked(useSession).mockReturnValue({
    data: {
      environment: { enableExperimentalFeatures },
      user: {
        admin,
        featureFlags: { llmGateway },
        organizations: [],
      },
    },
  } as unknown as ReturnType<typeof useSession>);
};

describe("useIsFeatureEnabled", () => {
  it("does not let admin or experimental-feature overrides enable internal flags", () => {
    mockSession({
      llmGateway: false,
      admin: true,
      enableExperimentalFeatures: true,
    });

    const { result } = renderHook(() => useIsFeatureEnabled("llmGateway"));

    expect(result.current).toBe(false);
  });

  it("returns the server-resolved internal flag", () => {
    mockSession({ llmGateway: true });

    const { result } = renderHook(() => useIsFeatureEnabled("llmGateway"));

    expect(result.current).toBe(true);
  });
});
