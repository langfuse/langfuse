import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("next/router", () => ({
  useRouter: () => ({ query: {}, push: vi.fn() }),
}));

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
    reportTrpcErrorWithoutToast: vi.fn(),
  };
});

vi.mock("@/src/components/ui/CodeJsonViewer", () => ({
  CodeView: ({ content }: { content: string }) => <pre>{content}</pre>,
}));

vi.mock("@/src/components/ui/InfoTooltip/InfoTooltip", () => ({
  InfoTooltip: ({
    label,
    children,
  }: {
    label: string;
    children: ReactNode;
  }) => <span aria-label={label}>{children}</span>,
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

  it("lists only the masked gateway key", () => {
    render(<GatewayApiKeysPage organizationId="org-1" />);

    expect(screen.getByText("sk-lf-...cdef")).toBeInTheDocument();
    expect(screen.queryByText("pk-lf-gateway")).not.toBeInTheDocument();
  });

  it("adds metadata entries in the expandable editor", () => {
    render(<GatewayApiKeysPage organizationId="org-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Create gateway key" }));

    const metadataTrigger = screen.getByRole("button", {
      name: /Metadata \(optional\)/,
    });
    expect(
      screen.queryByRole("textbox", { name: "Metadata key" }),
    ).not.toBeInTheDocument();

    fireEvent.click(metadataTrigger);
    fireEvent.change(screen.getByRole("textbox", { name: "Metadata key" }), {
      target: { value: "team" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Metadata value" }), {
      target: { value: "checkout" },
    });
    expect(metadataTrigger).toHaveTextContent("1 set");

    fireEvent.click(screen.getByRole("button", { name: "Add metadata" }));
    expect(
      screen.getAllByRole("textbox", { name: "Metadata key" }),
    ).toHaveLength(2);
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
