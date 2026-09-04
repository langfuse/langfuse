import { render, screen } from "@testing-library/react";

const { queryState } = vi.hoisted(() => ({
  queryState: {
    isPending: false,
    isError: false,
    data: [
      {
        metadata: { environment: "production", region: "eu" },
        apiKey: {
          id: "gateway-key-1",
          publicKey: "pk-lf-gateway",
          displaySecretKey: "sk-lf-...cdef",
          note: "Production app",
          createdAt: new Date("2026-09-04T12:00:00.000Z"),
        },
      },
    ],
    refetch: vi.fn(),
  },
}));

vi.mock("@/src/utils/api", () => {
  const mutation = () => ({
    isPending: false,
    isError: false,
    mutateAsync: vi.fn(),
  });
  return {
    api: {
      llmGateway: {
        listApiKeys: {
          useQuery: () => queryState,
        },
        createApiKey: { useMutation: mutation },
        revokeApiKey: { useMutation: mutation },
      },
      useUtils: () => ({
        llmGateway: {
          listApiKeys: { invalidate: vi.fn() },
        },
      }),
    },
    reportNonTrpcError: vi.fn(),
  };
});

vi.mock("@/src/components/ui/CodeJsonViewer", () => ({
  CodeView: ({ content }: { content: string }) => <pre>{content}</pre>,
}));

import { GatewayApiKeysPage } from "./GatewayApiKeysPage";

describe("GatewayApiKeysPage", () => {
  beforeEach(() => {
    queryState.isPending = false;
    queryState.isError = false;
  });

  it("shows a clear loading skeleton", () => {
    queryState.isPending = true;

    render(<GatewayApiKeysPage organizationId="org-1" />);

    expect(screen.getByTestId("gateway-api-keys-loading")).toBeInTheDocument();
  });

  it("renders only masked gateway key details and flat metadata", () => {
    render(<GatewayApiKeysPage organizationId="org-1" />);

    expect(screen.getByText("pk-lf-gateway")).toBeInTheDocument();
    expect(screen.getByText("sk-lf-...cdef")).toBeInTheDocument();
    expect(screen.getByText("Production app")).toBeInTheDocument();
    expect(screen.getByText("environment: production")).toBeInTheDocument();
    expect(screen.getByText("region: eu")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Revoke gateway key" }),
    ).toBeInTheDocument();
  });
});
