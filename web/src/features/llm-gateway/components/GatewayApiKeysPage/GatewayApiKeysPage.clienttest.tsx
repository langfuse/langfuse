import { fireEvent, render, screen } from "@testing-library/react";

const { fetchNextPage, queryState } = vi.hoisted(() => {
  const fetchNextPage = vi.fn();
  return {
    fetchNextPage,
    queryState: {
      isPending: false,
      isError: false,
      isFetchingNextPage: false,
      hasNextPage: true,
      data: {
        pages: [
          {
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
            nextCursor: "gateway-key-1",
          },
        ],
      },
      fetchNextPage,
      refetch: vi.fn(),
    },
  };
});

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
          useInfiniteQuery: () => queryState,
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
    queryState.isFetchingNextPage = false;
    queryState.hasNextPage = true;
    fetchNextPage.mockClear();
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

  it("loads the next page and exposes its pending state", () => {
    const { rerender } = render(<GatewayApiKeysPage organizationId="org-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(fetchNextPage).toHaveBeenCalledOnce();

    queryState.isFetchingNextPage = true;
    rerender(<GatewayApiKeysPage organizationId="org-1" />);
    expect(screen.getByRole("button", { name: "Load more" })).toBeDisabled();
  });
});
