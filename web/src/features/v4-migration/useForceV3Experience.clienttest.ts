import { renderHook } from "@testing-library/react";
import { useSession } from "next-auth/react";
import { vi } from "vitest";

import {
  useForceV3Experience,
  useIsForceV3ExperienceSettled,
} from "./useForceV3Experience";

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    projects: { byId: { useQuery: () => ({ data: undefined }) } },
  },
}));

describe("useForceV3Experience", () => {
  it("resolves the session project's force-v3 flag on first render", () => {
    vi.mocked(useSession).mockReturnValue({
      data: {
        user: {
          organizations: [
            {
              id: "org-1",
              projects: [{ id: "project-1", forceV3Experience: true }],
            },
          ],
        },
      },
    } as never);

    const { result } = renderHook(() => ({
      forceV3: useForceV3Experience("project-1"),
      settled: useIsForceV3ExperienceSettled("project-1"),
    }));

    expect(result.current).toEqual({ forceV3: true, settled: true });
  });
});
