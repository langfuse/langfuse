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
        featureFlags: { llmGateway: false },
        organizations: [
          {
            id: "org-1",
            featureFlags: { llmGateway },
            projects: [],
          },
        ],
      },
    },
  } as unknown as ReturnType<typeof useSession>);
};

describe("useIsFeatureEnabled", () => {
  it("does not let admin or experimental-feature overrides enable restricted flags", () => {
    mockSession({
      llmGateway: false,
      admin: true,
      enableExperimentalFeatures: true,
    });

    const { result } = renderHook(() =>
      useIsFeatureEnabled("llmGateway", { organizationId: "org-1" }),
    );

    expect(result.current).toBe(false);
  });

  it("returns the server-resolved organization flag", () => {
    mockSession({ llmGateway: true });

    const { result } = renderHook(() =>
      useIsFeatureEnabled("llmGateway", { organizationId: "org-1" }),
    );

    expect(result.current).toBe(true);
  });
});
