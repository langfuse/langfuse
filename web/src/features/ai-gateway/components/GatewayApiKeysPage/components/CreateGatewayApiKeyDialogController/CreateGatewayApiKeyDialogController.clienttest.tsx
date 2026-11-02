import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/src/components/ui/tooltip";

import { CreateGatewayApiKeyDialogController } from "./CreateGatewayApiKeyDialogController";

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(async () => ({ secretKey: "sk-lf-test-secret" })),
  invalidate: vi.fn(async () => undefined),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: null }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/features/rbac", () => ({
  useHasOrganizationAccess: () => false,
}));

vi.mock(
  "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GeneratedKeyContent/GeneratedKeyContent",
  () => ({
    GeneratedKeyContent: ({ secretKey }: { secretKey: string }) => (
      <div>{secretKey}</div>
    ),
  }),
);

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({
      aiGateway: { listApiKeys: { invalidate: mocks.invalidate } },
    }),
    aiGateway: {
      createApiKey: {
        useMutation: () => ({
          mutateAsync: mocks.mutateAsync,
          isPending: false,
        }),
      },
    },
  },
  reportNonTrpcError: vi.fn(),
  reportTrpcErrorWithoutToast: vi.fn(),
}));

async function renderCreatedKeyDialog() {
  render(
    <TooltipProvider>
      <CreateGatewayApiKeyDialogController organizationId="org-1">
        {({ openDialog }) => (
          <button type="button" onClick={openDialog}>
            Open
          </button>
        )}
      </CreateGatewayApiKeyDialogController>
    </TooltipProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Open" }));
  fireEvent.change(screen.getByRole("textbox", { name: /name/i }), {
    target: { value: "laptop" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create key" }));
  await screen.findByText("sk-lf-test-secret");
}

describe("CreateGatewayApiKeyDialogController", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  it("keeps the one-time key open on Escape and closes only on Done", async () => {
    await renderCreatedKeyDialog();

    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByText("sk-lf-test-secret")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(screen.queryByText("sk-lf-test-secret")).toBeNull(),
    );
  });
});
