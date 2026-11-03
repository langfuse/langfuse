import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/src/components/ui/tooltip";
import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import type { RouterOutputs } from "@/src/utils/api";

import { GatewayAliasesPage } from "./GatewayAliasesPage";
import { AliasDialogController } from "./components/AliasDialogController";

const aliases: RouterOutputs["aiGateway"]["listAliases"] = [
  {
    id: "alias-1",
    name: "gpt-fast",
    status: "ENABLED" as const,
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    targets: [
      {
        id: "t-1",
        connectionId: "conn-1",
        connectionName: "OpenAI",
        connectionProvider: "OPENAI" as const,
        connectionStatus: "ENABLED" as const,
        providerModel: "gpt-4.1",
        position: 0,
      },
    ],
  },
];

const connections = [
  {
    id: "conn-1",
    name: "OpenAI",
    provider: "OPENAI" as const,
    allowedModels: [],
    supportedRoutes: [],
    models: [],
  },
  {
    id: "conn-2",
    name: "Anthropic",
    provider: "ANTHROPIC" as const,
    allowedModels: [],
    supportedRoutes: [],
    models: [],
  },
];

const mocks = vi.hoisted(() => ({
  upsertMutateAsync: vi.fn(
    async (_input: unknown): Promise<{ id: string }> => ({ id: "alias-2" }),
  ),
  upsertIsPending: false,
  connectionsQuery: { isPending: false, isError: false } as {
    isPending: boolean;
    isError: boolean;
  },
  invalidate: vi.fn(async () => undefined),
  capture: vi.fn(),
}));

vi.mock("@/src/utils/api", () => ({
  reportNonTrpcError: vi.fn(),
  api: {
    useUtils: () => ({
      aiGateway: { listAliases: { invalidate: mocks.invalidate } },
    }),
    aiGateway: {
      listAliases: {
        useQuery: () => ({ isPending: false, isError: false, data: aliases }),
      },
      listModelConnections: {
        useQuery: () =>
          mocks.connectionsQuery.isPending || mocks.connectionsQuery.isError
            ? { ...mocks.connectionsQuery, data: undefined, refetch: vi.fn() }
            : {
                isPending: false,
                isError: false,
                data: connections,
                refetch: vi.fn(),
              },
      },
      getSetupStatus: {
        useQuery: () => ({ isPending: false, data: {} }),
      },
      upsertAlias: {
        useMutation: () => ({
          mutateAsync: mocks.upsertMutateAsync,
          isPending: mocks.upsertIsPending,
          error: null,
          reset: vi.fn(),
        }),
      },
      deleteAlias: {
        useMutation: () => ({
          mutateAsync: vi.fn(),
          isPending: false,
          error: null,
          reset: vi.fn(),
        }),
      },
    },
  },
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => mocks.capture,
}));

vi.mock("@/src/features/rbac", () => ({
  useHasOrganizationAccess: () => true,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    status: "authenticated",
    data: { environment: { aiGatewayDeployed: true } },
  }),
}));

vi.mock("@/src/features/feature-flags", () => ({
  useIsFeatureEnabled: () => true,
}));

type AliasFixture = RouterOutputs["aiGateway"]["listAliases"][number];

async function openEditDialog(alias: AliasFixture) {
  render(
    <LayerProvider>
      <TooltipProvider>
        <AliasDialogController
          organizationId="org-1"
          connections={connections}
          onSaved={() => undefined}
        >
          {({ openDialog }) => (
            <button type="button" onClick={() => openDialog(alias)}>
              Edit
            </button>
          )}
        </AliasDialogController>
      </TooltipProvider>
    </LayerProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  await screen.findByRole("dialog", undefined, { timeout: 3000 });
}

function renderPage() {
  render(
    <LayerProvider>
      <TooltipProvider>
        <GatewayAliasesPage organizationId="org-1" />
      </TooltipProvider>
    </LayerProvider>,
  );
}

async function openDialog() {
  render(
    <LayerProvider>
      <TooltipProvider>
        <GatewayAliasesPage organizationId="org-1" />
      </TooltipProvider>
    </LayerProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "New alias" }));
  await screen.findByRole("dialog", undefined, { timeout: 3000 });
}

describe("GatewayAliasesPage alias dialog", () => {
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
  });

  beforeEach(() => {
    mocks.upsertMutateAsync.mockReset();
    mocks.upsertMutateAsync.mockResolvedValue({ id: "alias-2" });
    mocks.upsertIsPending = false;
    mocks.connectionsQuery = { isPending: false, isError: false };
  });

  it("saves a new alias with two targets in visual order", async () => {
    await openDialog();

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "claude-fallback" },
    });
    // First target row: connection then upstream model.
    fireEvent.click(
      screen.getByRole("combobox", { name: "Target 1 connection" }),
    );
    fireEvent.click((await screen.findAllByText("OpenAI")).at(-1)!);
    fireEvent.change(screen.getByLabelText("Target 1 model"), {
      target: { value: "claude-sonnet-4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add target" }));
    fireEvent.click(
      screen.getByRole("combobox", { name: "Target 2 connection" }),
    );
    fireEvent.click((await screen.findAllByText("Anthropic")).at(-1)!);
    fireEvent.change(screen.getByLabelText("Target 2 model"), {
      target: { value: "claude-haiku-4" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save alias" }));

    await waitFor(() =>
      expect(mocks.upsertMutateAsync).toHaveBeenCalledWith({
        orgId: "org-1",
        name: "claude-fallback",
        status: "ENABLED",
        targets: [
          { connectionId: "conn-1", providerModel: "claude-sonnet-4" },
          { connectionId: "conn-2", providerModel: "claude-haiku-4" },
        ],
      }),
    );
    expect(mocks.invalidate).toHaveBeenCalledWith({ orgId: "org-1" });
  });

  it("keeps a disabled alias disabled when it is edited", async () => {
    mocks.upsertMutateAsync.mockClear();
    const disabledAlias = { ...aliases[0]!, status: "DISABLED" as const };
    render(
      <LayerProvider>
        <TooltipProvider>
          <AliasDialogController
            organizationId="org-1"
            connections={connections}
            onSaved={() => undefined}
          >
            {({ openDialog }) => (
              <button type="button" onClick={() => openDialog(disabledAlias)}>
                Edit
              </button>
            )}
          </AliasDialogController>
        </TooltipProvider>
      </LayerProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await screen.findByRole("dialog", undefined, { timeout: 3000 });

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "gpt-fast-renamed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save alias" }));

    await waitFor(() =>
      expect(mocks.upsertMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "alias-1",
          name: "gpt-fast-renamed",
          status: "DISABLED",
        }),
      ),
    );
  });

  it("clears the upstream model when a target's connection changes", async () => {
    await openEditDialog(aliases[0]!);

    fireEvent.click(
      screen.getByRole("combobox", { name: "Target 1 connection" }),
    );
    fireEvent.click((await screen.findAllByText("Anthropic")).at(-1)!);

    expect(screen.getByLabelText("Target 1 model")).toHaveValue("");
  });

  it("does not save an alias without targets", async () => {
    await openEditDialog({ ...aliases[0]!, targets: [] });

    expect(screen.getByRole("button", { name: "Save alias" })).toBeDisabled();
  });

  it("shows a target's connection when it is no longer enabled", async () => {
    await openEditDialog({
      ...aliases[0]!,
      targets: [
        {
          ...aliases[0]!.targets[0]!,
          connectionId: "conn-gone",
          connectionName: "Legacy OpenAI",
          connectionStatus: "DISABLED",
        },
      ],
    });

    expect(
      screen.getByRole("combobox", { name: "Target 1 connection" }),
    ).toHaveTextContent("Legacy OpenAI (disabled)");
  });

  it("clears the previous save error when saving again", async () => {
    mocks.upsertMutateAsync
      .mockRejectedValueOnce(new Error("Upstream rejected the alias"))
      .mockImplementationOnce(() => new Promise(() => undefined));
    await openEditDialog(aliases[0]!);

    fireEvent.click(screen.getByRole("button", { name: "Save alias" }));
    await screen.findByText("Upstream rejected the alias");

    fireEvent.click(screen.getByRole("button", { name: "Save alias" }));
    await waitFor(() =>
      expect(
        screen.queryByText("Upstream rejected the alias"),
      ).not.toBeInTheDocument(),
    );
  });

  it("blocks saving duplicate targets", async () => {
    const target = aliases[0]!.targets[0]!;
    await openEditDialog({
      ...aliases[0]!,
      targets: [target, { ...target, id: "t-2", position: 1 }],
    });

    expect(screen.getByRole("button", { name: "Save alias" })).toBeDisabled();
    expect(screen.getByText(/Target 2 repeats target 1/)).toBeInTheDocument();
  });
});

describe("GatewayAliasesPage table", () => {
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

  beforeEach(() => {
    mocks.upsertIsPending = false;
    mocks.connectionsQuery = { isPending: false, isError: false };
  });

  it("lists aliases when the connections cannot be loaded", async () => {
    mocks.connectionsQuery = { isPending: false, isError: true };
    renderPage();

    expect(await screen.findByText("gpt-fast")).toBeInTheDocument();
  });

  it("disables the status toggle while an alias update is in flight", async () => {
    mocks.upsertIsPending = true;
    renderPage();

    fireEvent.click(
      (await screen.findAllByRole("button", { name: "Open actions menu" }))[0]!,
    );
    const toggle = await screen.findByRole("menuitem", {
      name: /Disable alias/,
    });
    expect(toggle).toHaveAttribute("aria-disabled", "true");
  });
});
