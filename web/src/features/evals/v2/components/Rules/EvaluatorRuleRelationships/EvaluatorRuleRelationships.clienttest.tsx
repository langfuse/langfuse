import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EvalTemplateType } from "@langfuse/shared";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EvaluatorRuleRelationshipsSheet } from "./EvaluatorRuleRelationships";

const mocks = vi.hoisted(() => ({
  attach: vi.fn().mockResolvedValue(undefined),
  invalidate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => true,
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({
      client: {
        evalsV2: {
          activationCostEstimates: {
            mutate: vi.fn().mockResolvedValue([
              {
                evaluatorId: "evaluator-1",
                matchingObservations: 1,
                sampling: 1,
                testRunCostUsd: 0.01,
                estimatedCostUsd: 0.01,
              },
            ]),
          },
        },
      },
      evalsV2: {
        rules: {
          listRulesForEvaluator: { invalidate: mocks.invalidate },
          list: { invalidate: mocks.invalidate },
        },
        list: { invalidate: mocks.invalidate },
      },
    }),
    evalsV2: {
      rules: {
        listRulesForEvaluator: {
          useQuery: () => ({ data: [], isPending: false }),
        },
        list: {
          useQuery: () => ({
            data: {
              rules: [
                {
                  id: "rule-1",
                  name: "Production rule",
                  enabled: true,
                  filter: [],
                  sampling: 1,
                },
              ],
            },
            isPending: false,
          }),
        },
        attach: {
          useMutation: (options: { onSuccess: () => Promise<void> }) => ({
            isPending: false,
            mutateAsync: async (input: unknown) => {
              await mocks.attach(input);
              await options.onSuccess();
            },
          }),
        },
        update: {
          useMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
        },
        detach: {
          useMutation: () => ({ isPending: false, mutate: vi.fn() }),
        },
      },
    },
  },
}));

function Harness() {
  const [selected, setSelected] = useState(true);
  return selected ? (
    <EvaluatorRuleRelationshipsSheet
      projectId="project-1"
      evaluatorId="evaluator-1"
      evaluatorName="Quality judge"
      evaluatorType={EvalTemplateType.LLM_AS_JUDGE}
      evaluatorDefaultVariableMapping={null}
      source="evaluator_overview"
      open
      onOpenChange={(open) => {
        if (!open) setSelected(false);
      }}
    />
  ) : (
    <span>Sheet closed</span>
  );
}

describe("EvaluatorRuleRelationshipsSheet", () => {
  beforeEach(() => {
    mocks.attach.mockClear();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Element.prototype.scrollIntoView = vi.fn();
    document.body.innerHTML = `<div data-overlay-root>${[
      "panel",
      "agent",
      "modal",
      "popover",
      "tooltip",
      "toast",
    ]
      .map((layer) => `<div data-layer="${layer}"></div>`)
      .join("")}</div>`;
  });

  it("keeps the evaluator-table sheet mounted while confirming a portaled rule attachment", async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: /attach to rule/i }));
    const rule = await screen.findByRole("option", {
      name: /production rule/i,
    });
    fireEvent.pointerDown(rule);
    fireEvent.click(rule);

    const confirm = await screen.findByRole("button", {
      name: "Attach evaluator",
    });
    fireEvent.pointerDown(confirm);
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(mocks.attach).toHaveBeenCalledWith({
        projectId: "project-1",
        ruleId: "rule-1",
        evaluatorId: "evaluator-1",
        variableMapping: null,
      }),
    );
    expect(screen.queryByText("Sheet closed")).not.toBeInTheDocument();
  });
});
