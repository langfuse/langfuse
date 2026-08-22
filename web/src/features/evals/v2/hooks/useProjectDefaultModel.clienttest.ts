import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useProjectDefaultModel } from "./useProjectDefaultModel";

const mocks = vi.hoisted(() => ({
  refetchConnections: vi.fn(),
}));

vi.mock("@/src/env.mjs", () => ({
  env: { NEXT_PUBLIC_BASE_PATH: "" },
}));

vi.mock("@/src/features/notifications/showSuccessToast", () => ({
  showSuccessToast: vi.fn(),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => true,
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({
      defaultLlmModel: {
        fetchDefaultModel: { invalidate: vi.fn() },
      },
      evalsV2: {
        list: { invalidate: vi.fn() },
        options: { invalidate: vi.fn() },
      },
    }),
    defaultLlmModel: {
      fetchDefaultModel: {
        useQuery: () => ({ data: null }),
      },
      upsertDefaultModel: {
        useMutation: () => ({ isPending: false, mutate: vi.fn() }),
      },
    },
    llmApiKey: {
      all: {
        useQuery: () => ({
          data: { data: [] },
          isPending: false,
          refetch: mocks.refetchConnections,
        }),
      },
    },
  },
}));

vi.mock("@/src/utils/trpcErrorToast", () => ({
  trpcErrorToast: vi.fn(),
}));

describe("useProjectDefaultModel", () => {
  beforeEach(() => {
    mocks.refetchConnections.mockReset();
    vi.spyOn(window, "open").mockImplementation(() => null);
  });

  it("refreshes model connections after returning from provider settings", () => {
    const { result } = renderHook(() =>
      useProjectDefaultModel({ projectId: "project-1", source: "editor" }),
    );

    act(() => result.current.openProviderSettings());
    expect(window.open).toHaveBeenCalledWith(
      "/project/project-1/settings/llm-connections",
      "_blank",
      "noopener,noreferrer",
    );

    act(() => window.dispatchEvent(new Event("focus")));

    expect(mocks.refetchConnections).toHaveBeenCalledOnce();

    act(() => window.dispatchEvent(new Event("focus")));

    expect(mocks.refetchConnections).toHaveBeenCalledOnce();
  });
});
