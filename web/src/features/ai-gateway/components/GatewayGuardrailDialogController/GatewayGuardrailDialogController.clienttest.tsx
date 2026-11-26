// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";

import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import { GatewayGuardrailDialogController } from "./GatewayGuardrailDialogController";

const mocks = vi.hoisted(() => ({
  mutation: {
    status: "idle" as const,
    isPending: false,
    isError: false,
    data: undefined,
    error: null,
    mutateAsync: vi.fn(),
    reset: vi.fn(),
  },
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    aiGateway: {
      guardrails: {
        test: { useMutation: () => mocks.mutation },
        create: { useMutation: () => mocks.mutation },
        update: { useMutation: () => mocks.mutation },
        setAssignments: { useMutation: () => mocks.mutation },
        searchTargets: {
          useQuery: () => ({
            data: { users: [], apiKeys: [] },
            isLoading: false,
          }),
        },
        previewRegex: {
          useQuery: () => ({ data: undefined, isFetching: false }),
        },
      },
    },
  },
  reportNonTrpcError: vi.fn(),
  reportTrpcErrorWithoutToast: vi.fn(),
  sendAsPostOption: {},
}));

vi.mock(
  "@/src/features/ai-gateway/hooks/useInvalidateGatewayGuardrails",
  () => ({
    useInvalidateGatewayGuardrails: () => vi.fn(),
  }),
);

vi.mock(
  "@/src/features/ai-gateway/hooks/useOpenGuardrailsLimitFeedback",
  () => ({
    useOpenGuardrailsLimitFeedback: () => vi.fn(),
  }),
);

describe("GatewayGuardrailDialogController", () => {
  beforeAll(() => {
    if (typeof globalThis.ResizeObserver === "undefined") {
      globalThis.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the same dialog node mounted when navigating to Amazon Bedrock and back", () => {
    render(
      <LayerProvider>
        <GatewayGuardrailDialogController organizationId="org-1">
          {({ openDialog }) => (
            <button
              type="button"
              onClick={() => openDialog({ mode: "create" })}
            >
              Add guardrail
            </button>
          )}
        </GatewayGuardrailDialogController>
      </LayerProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add guardrail" }));

    const initialDialog = screen.getByRole("dialog");
    const initialOverlay = initialDialog.previousElementSibling;
    expect(initialOverlay).not.toBeNull();
    expect(screen.getByText("Add a guardrail")).toBeInTheDocument();

    const integrationsTab = screen.getByRole("tab", {
      name: /Integrations/i,
    });
    fireEvent.mouseDown(integrationsTab, { button: 0 });
    fireEvent.click(integrationsTab);

    fireEvent.click(screen.getByRole("button", { name: /Amazon Bedrock/i }));

    expect(screen.getByRole("dialog")).toBe(initialDialog);
    expect(screen.getByRole("dialog").previousElementSibling).toBe(
      initialOverlay,
    );
    expect(
      screen.getByRole("button", { name: "Back to guardrail types" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Back to guardrail types" }),
    );

    expect(screen.getByRole("dialog")).toBe(initialDialog);
    expect(screen.getByRole("dialog").previousElementSibling).toBe(
      initialOverlay,
    );
    expect(screen.getByText("Add a guardrail")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Integrations/i })).toHaveAttribute(
      "data-state",
      "active",
    );
  });

  it.each([
    { runsOn: "INPUT" as const, scope: "LAST_TURN" as const, expected: false },
    {
      runsOn: "INPUT" as const,
      scope: "ENTIRE_INPUT" as const,
      expected: false,
    },
    { runsOn: "OUTPUT" as const, scope: "LAST_TURN" as const, expected: true },
    { runsOn: "BOTH" as const, scope: "LAST_TURN" as const, expected: true },
    {
      runsOn: "BOTH" as const,
      scope: "ENTIRE_INPUT" as const,
      expected: true,
    },
  ])(
    "shows the streaming notice only when runsOn includes output ($runsOn / $scope)",
    ({ runsOn, scope, expected }) => {
      render(
        <LayerProvider>
          <GatewayGuardrailDialogController organizationId="org-1">
            {({ openDialog }) => (
              <button
                type="button"
                onClick={() =>
                  openDialog({
                    mode: "edit",
                    guardrail: {
                      id: "g-1",
                      name: "PII rule",
                      type: "REGEX",
                      action: "REDACT",
                      scope,
                      runsOn,
                      redactionLabel: "[REDACTED]",
                      presets: ["email"],
                      secretPrefixes: [],
                      containsWords: [],
                      customRegex: null,
                      bedrock: null,
                      assignments: [
                        {
                          id: "a-1",
                          scope: "ORGANIZATION",
                          label: "Everyone",
                        },
                      ],
                      flaggedCount7d: 0,
                      createdAt: new Date(0),
                      updatedAt: new Date(0),
                    },
                  })
                }
              >
                Edit guardrail
              </button>
            )}
          </GatewayGuardrailDialogController>
        </LayerProvider>,
      );

      fireEvent.click(screen.getByRole("button", { name: "Edit guardrail" }));

      const notice = screen.queryByText(
        "Streaming is turned off when checking output.",
      );
      if (expected) {
        expect(notice).toBeInTheDocument();
        expect(notice?.closest('[role="alert"]')).toHaveAttribute(
          "data-variant",
          "info",
        );
      } else {
        expect(notice).not.toBeInTheDocument();
      }
    },
  );
});
