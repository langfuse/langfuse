import { TRPCClientError } from "@trpc/client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { Button } from "@/src/components/ui/button";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import type { GatewayConnection } from "@/src/features/ai-gateway/types/gatewayProvider";

const {
  reportTrpcErrorWithoutToastMock,
  reportNonTrpcErrorMock,
  showErrorToastMock,
  testConnectionMutateAsync,
  createApiKeyMutateAsync,
  mutationStates,
} = vi.hoisted(() => {
  const mutationStates = {
    testConnection: {
      isError: false,
      isPending: false,
      error: null as Error | null,
    },
    createConnection: {
      isError: false,
      isPending: false,
      error: null as Error | null,
    },
    updateConnection: {
      isError: false,
      isPending: false,
      error: null as Error | null,
    },
    createApiKey: {
      isError: false,
      isPending: false,
      error: null as Error | null,
    },
  };

  return {
    reportTrpcErrorWithoutToastMock: vi.fn(),
    reportNonTrpcErrorMock: vi.fn(),
    showErrorToastMock: vi.fn(),
    testConnectionMutateAsync: vi.fn(),
    createApiKeyMutateAsync: vi.fn(),
    mutationStates,
  };
});

const providerValidationError = () =>
  new TRPCClientError("Provider credential validation failed", {
    result: {
      error: {
        message: "Provider credential validation failed",
        code: -32600,
        data: {
          code: "BAD_REQUEST",
          httpStatus: 400,
          path: "aiGateway.createConnection",
        },
      },
    },
  });

const gatewayApiKeyError = () =>
  new TRPCClientError("Gateway key limit reached", {
    result: {
      error: {
        message: "Gateway key limit reached",
        code: -32600,
        data: {
          code: "BAD_REQUEST",
          httpStatus: 400,
          path: "aiGateway.createApiKey",
        },
      },
    },
  });

vi.mock("@/src/utils/api", () => {
  const React = require("react");

  const createStatefulMutation = <TArgs extends unknown[]>(
    mutateImpl: (...args: TArgs) => Promise<unknown>,
    stateKey: keyof typeof mutationStates,
  ) => {
    return (options?: { onError?: (error: unknown) => void }) => {
      const [mutationState, setMutationState] = React.useState({
        isError: false,
        isPending: false,
        error: null as Error | null,
      });

      return {
        ...mutationState,
        mutateAsync: async (...args: TArgs) => {
          setMutationState(
            (current: {
              isError: boolean;
              isPending: boolean;
              error: Error | null;
            }) => ({ ...current, isPending: true }),
          );
          try {
            return await mutateImpl(...args);
          } catch (error) {
            const normalizedError =
              error instanceof Error ? error : new Error(String(error));
            mutationStates[stateKey] = {
              isError: true,
              isPending: false,
              error: normalizedError,
            };
            options?.onError?.(error);
            setMutationState({
              isError: true,
              isPending: false,
              error: normalizedError,
            });
            throw error;
          }
        },
      };
    };
  };

  return {
    api: {
      useUtils: () => ({
        aiGateway: {
          listConnections: { invalidate: vi.fn() },
          listApiKeys: { invalidate: vi.fn() },
        },
      }),
      aiGateway: {
        testConnection: {
          useMutation: createStatefulMutation(
            async (input: {
              orgId: string;
              provider: string;
              credential: string;
            }) => testConnectionMutateAsync(input),
            "testConnection",
          ),
        },
        createConnection: {
          useMutation: createStatefulMutation(async () => {
            throw providerValidationError();
          }, "createConnection"),
        },
        updateConnection: {
          useMutation: createStatefulMutation(async () => {
            throw providerValidationError();
          }, "updateConnection"),
        },
        createApiKey: {
          useMutation: createStatefulMutation(
            async (input: {
              orgId: string;
              note?: string;
              metadata: Record<string, string>;
            }) => {
              createApiKeyMutateAsync(input);
              throw gatewayApiKeyError();
            },
            "createApiKey",
          ),
        },
      },
    },
    reportTrpcErrorWithoutToast: reportTrpcErrorWithoutToastMock,
    reportNonTrpcError: reportNonTrpcErrorMock,
  };
});

vi.mock("@/src/features/notifications/showErrorToast", () => ({
  showErrorToast: showErrorToastMock,
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ query: {}, push: vi.fn() }),
}));

import { CreateGatewayApiKeyDialogController } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/CreateGatewayApiKeyDialogController/CreateGatewayApiKeyDialogController";
import { ProviderDialogController } from "@/src/features/ai-gateway/components/GatewayProvidersPage/components/ProviderDialogController/ProviderDialogController";

const testConnection: GatewayConnection = {
  id: "conn-1",
  organizationId: "org-1",
  name: "Production",
  provider: "OPENAI",
  status: "ENABLED",
  displaySecret: "sk-...abcd",
  createdById: "user-1",
  routingPriority: 0,
  createdAt: new Date("2026-09-04T12:00:00.000Z"),
  updatedAt: new Date("2026-09-04T12:00:00.000Z"),
};

describe("gateway mutation local error handling", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn();
  });

  beforeEach(() => {
    reportTrpcErrorWithoutToastMock.mockClear();
    reportNonTrpcErrorMock.mockClear();
    showErrorToastMock.mockClear();
    testConnectionMutateAsync.mockClear();
    createApiKeyMutateAsync.mockClear();
    mutationStates.testConnection = {
      isError: false,
      isPending: false,
      error: null,
    };
    mutationStates.createConnection = {
      isError: false,
      isPending: false,
      error: null,
    };
    mutationStates.updateConnection = {
      isError: false,
      isPending: false,
      error: null,
    };
    mutationStates.createApiKey = {
      isError: false,
      isPending: false,
      error: null,
    };
  });

  it("tests a provider credential without saving", async () => {
    render(
      <ProviderDialogController organizationId="org-1">
        {({ Trigger }) => (
          <Trigger asChild>
            <Button>Add provider</Button>
          </Trigger>
        )}
      </ProviderDialogController>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add provider" }));
    fireEvent.change(screen.getByLabelText("Secret key"), {
      target: { value: "sk-test-only" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test only" }));

    await waitFor(() => {
      expect(testConnectionMutateAsync).toHaveBeenCalledWith({
        orgId: "org-1",
        provider: "OPENAI",
        credential: "sk-test-only",
      });
    });
    expect(
      screen.getByRole("heading", { name: "Add provider credential" }),
    ).toBeInTheDocument();
  });

  it("create provider dialog routes tRPC failures locally without a global toast", async () => {
    render(
      <ProviderDialogController organizationId="org-1">
        {({ Trigger }) => (
          <Trigger asChild>
            <Button>Add provider</Button>
          </Trigger>
        )}
      </ProviderDialogController>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add provider" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Production" },
    });
    fireEvent.change(screen.getByLabelText("Secret key"), {
      target: { value: "sk-invalid" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test and save" }));

    await waitFor(() => {
      expect(reportTrpcErrorWithoutToastMock).toHaveBeenCalledWith(
        expect.any(TRPCClientError),
        "ai-gateway-providers",
      );
    });
    expect(reportNonTrpcErrorMock).toHaveBeenCalledWith(
      expect.any(TRPCClientError),
      "ai-gateway-providers",
    );
    expect(showErrorToastMock).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Provider credential validation failed"),
    ).toBeInTheDocument();
  });

  it("edit provider dialog routes tRPC failures locally without a global toast", async () => {
    render(
      <ProviderDialogController
        organizationId="org-1"
        connection={testConnection}
      >
        {({ Trigger }) => (
          <Trigger asChild>
            <Button>Edit provider</Button>
          </Trigger>
        )}
      </ProviderDialogController>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit provider" }));
    fireEvent.change(screen.getByLabelText("Secret key"), {
      target: { value: "sk-invalid" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test and save" }));

    await waitFor(() => {
      expect(reportTrpcErrorWithoutToastMock).toHaveBeenCalledWith(
        expect.any(TRPCClientError),
        "ai-gateway-providers",
      );
    });
    expect(showErrorToastMock).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Provider credential validation failed"),
    ).toBeInTheDocument();
  });

  it("create gateway api key dialog routes tRPC failures locally and ignores blank metadata rows", async () => {
    render(
      <TooltipProvider>
        <CreateGatewayApiKeyDialogController organizationId="org-1">
          {({ Trigger }) => (
            <Trigger asChild>
              <Button>Issue key</Button>
            </Trigger>
          )}
        </CreateGatewayApiKeyDialogController>
      </TooltipProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Issue key" }));
    fireEvent.click(screen.getByRole("button", { name: "Create key" }));

    await waitFor(() => {
      expect(reportTrpcErrorWithoutToastMock).toHaveBeenCalledWith(
        expect.any(TRPCClientError),
        "ai-gateway-api-keys",
      );
    });
    expect(showErrorToastMock).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Gateway key limit reached"),
    ).toBeInTheDocument();
    expect(createApiKeyMutateAsync).toHaveBeenCalledWith({
      orgId: "org-1",
      note: undefined,
      metadata: {},
    });
  });
});
