import { render, screen } from "@testing-library/react";
import { EvalTemplateType } from "@langfuse/shared";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import { EvaluatorSavedCostSummary } from "./EvaluatorSavedCostSummary";

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

describe("EvaluatorSavedCostSummary", () => {
  it("uses the backfill estimate when the recurring window has no matches", () => {
    render(
      <TooltipProvider>
        <EvaluatorSavedCostSummary
          estimates={[]}
          unavailableEstimateCount={0}
          matchingObservations={0}
          sampling={1}
          isEstimating={false}
          onSamplingChange={vi.fn()}
          evaluatorType={EvalTemplateType.LLM_AS_JUDGE}
          backfill={{
            enabled: true,
            matchingObservations: 10,
            maxItems: 10,
            isEstimating: false,
            testRunCostUsd: 0.01,
          }}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText("≈ $0.10")).toBeInTheDocument();
  });
});
