import { act, renderHook } from "@testing-library/react";
import { LLMAdapter } from "@langfuse/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useProjectDefaultModel } from "./useProjectDefaultModel";

const mocks = vi.hoisted(() => ({
  refetchConnections: vi.fn(),
  invalidateDefaultModel: vi.fn(),
  invalidateEvaluatorList: vi.fn(),
  invalidateEvaluatorOptions: vi.fn(),
  invalidateEvaluatorFilterOptions: vi.fn(),
  upsertDefaultModel: vi.fn(),
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
        fetchDefaultModel: { invalidate: mocks.invalidateDefaultModel },
      },
      evalsV2: {
        list: { invalidate: mocks.invalidateEvaluatorList },
        options: { invalidate: mocks.invalidateEvaluatorOptions },
        filterOptions: { invalidate: mocks.invalidateEvaluatorFilterOptions },
      },
    }),
    defaultLlmModel: {
      fetchDefaultModel: {
        useQuery: () => ({ data: null }),
      },
      upsertDefaultModel: {
        useMutation: () => ({
          isPending: false,
          mutate: mocks.upsertDefaultModel,
        }),
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
    Object.values(mocks).forEach((mock) => mock.mockReset());
    vi.spyOn(window, "open").mockImplementation(() => null);
  });

  it("refreshes model filter options after updating the project default", async () => {
    const { result } = renderHook(() =>
      useProjectDefaultModel({ projectId: "project-1", source: "overview" }),
    );

    act(() =>
      result.current.update.requestUpdate({
        provider: "openai",
        model: "gpt-4.1",
        adapter: LLMAdapter.OpenAI,
        modelParams: {},
      }),
    );
    const mutationOptions = mocks.upsertDefaultModel.mock.calls[0]?.[1];
    await act(async () => mutationOptions?.onSuccess());

    expect(mocks.invalidateEvaluatorFilterOptions).toHaveBeenCalledWith({
      projectId: "project-1",
    });
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
