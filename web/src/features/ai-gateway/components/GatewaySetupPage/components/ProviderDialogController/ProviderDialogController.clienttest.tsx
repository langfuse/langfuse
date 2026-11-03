import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GatewayConnection } from "@/src/features/ai-gateway/types/gatewayProvider";

import { ProviderDialogController } from "./ProviderDialogController";

const mocks = vi.hoisted(() => ({
  testMutateAsync: vi.fn(
    async (
      _input: unknown,
    ): Promise<{ success: boolean; routes: string[] | null }> => ({
      success: true,
      routes: [],
    }),
  ),
}));

vi.mock("@/src/utils/api", async () => {
  const { useRef, useState } = await vi.importActual<typeof React>("react");
  /** Tracks the outcome like React Query, including that `reset` detaches
   * the observer from a mutation still in flight. */
  const useFakeMutation = (
    mutateAsync: (input: unknown) => Promise<unknown>,
  ) => {
    const [status, setStatus] = useState<"idle" | "pending" | "success">(
      "idle",
    );
    const generation = useRef(0);
    return {
      mutateAsync: async (input: unknown) => {
        const current = generation.current;
        setStatus("pending");
        const result = await mutateAsync(input);
        if (current === generation.current) setStatus("success");
        return result;
      },
      isPending: status === "pending",
      isSuccess: status === "success",
      isError: false,
      error: null,
      reset: () => {
        generation.current += 1;
        setStatus("idle");
      },
    };
  };
  return {
    reportNonTrpcError: vi.fn(),
    reportTrpcErrorWithoutToast: vi.fn(),
    api: {
      useUtils: () => ({}),
      aiGateway: {
        testConnection: {
          useMutation: () => useFakeMutation(mocks.testMutateAsync),
        },
        createConnection: {
          useMutation: () => useFakeMutation(async () => ({})),
        },
        updateConnection: {
          useMutation: () => useFakeMutation(async () => ({})),
        },
      },
    },
  };
});

vi.mock(
  "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/hooks/useExistingConnectionNames",
  () => ({ useExistingConnectionNames: () => ["Local vLLM"] }),
);

vi.mock("@/src/features/organizations/hooks", () => ({
  useLangfuseCloudRegion: () => ({ region: undefined }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

const customConnection = {
  id: "conn-custom",
  organizationId: "org-1",
  name: "Local vLLM",
  provider: "CUSTOM",
  baseUrl: "http://vllm.internal:8000/v1",
  displaySecret: "...abcd",
  createdById: null,
  status: "ENABLED",
  allowedModels: null,
  supportedRoutes: ["openai.chat-completions"],
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
} as GatewayConnection;

async function openEditDialog() {
  render(
    <ProviderDialogController organizationId="org-1" surface="overview">
      {({ openEditDialog }) => (
        <button type="button" onClick={() => openEditDialog(customConnection)}>
          Edit
        </button>
      )}
    </ProviderDialogController>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  await screen.findByRole("dialog");
}

describe("ProviderDialogController", () => {
  beforeEach(() => {
    mocks.testMutateAsync.mockClear();
    mocks.testMutateAsync.mockResolvedValue({ success: true, routes: [] });
  });

  it("tests an edited custom connection against its stored key", async () => {
    await openEditDialog();

    fireEvent.click(screen.getByRole("button", { name: "Test" }));

    await waitFor(() =>
      expect(mocks.testMutateAsync).toHaveBeenCalledWith({
        orgId: "org-1",
        provider: "CUSTOM",
        credential: "",
        baseUrl: "http://vllm.internal:8000/v1",
        id: "conn-custom",
      }),
    );
  });

  it("warns when a custom host serves no supported route", async () => {
    await openEditDialog();

    fireEvent.click(screen.getByRole("button", { name: "Test" }));

    expect(
      await screen.findByText("No supported routes detected"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Provider credential is valid"),
    ).not.toBeInTheDocument();
  });

  it("clears a test result when the base URL changes", async () => {
    mocks.testMutateAsync.mockResolvedValue({
      success: true,
      routes: ["openai.chat-completions"],
    });
    await openEditDialog();

    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    expect(await screen.findByText("Routes detected")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Base URL"), {
      target: { value: "http://other.internal:8000/v1" },
    });

    expect(screen.queryByText("Routes detected")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Provider credential is valid"),
    ).not.toBeInTheDocument();
  });

  it("ignores a test result that arrives after the base URL changed", async () => {
    let resolveTest: (value: {
      success: boolean;
      routes: string[] | null;
    }) => void = () => {};
    mocks.testMutateAsync.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTest = resolve;
        }),
    );
    await openEditDialog();

    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    await waitFor(() => expect(mocks.testMutateAsync).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText("Base URL"), {
      target: { value: "http://other.internal:8000/v1" },
    });
    resolveTest({ success: true, routes: ["openai.chat-completions"] });

    await waitFor(() =>
      expect(screen.getByLabelText("Base URL")).toHaveValue(
        "http://other.internal:8000/v1",
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText("Routes detected")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Provider credential is valid"),
    ).not.toBeInTheDocument();
  });
});
