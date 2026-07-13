import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/src/components/ui/tooltip";

import {
  InAppAgentAnalyzeSelectionButton,
  InAppAgentExplainErrorButton,
} from "./InAppAgentTraceButtons";

const startAssistantRun = vi.fn();

vi.mock("./InAppAiAgentProvider", () => ({
  useInAppAiAgent: () => ({
    isAvailable: true,
    startAssistantRun,
  }),
}));

describe("InAppAgentExplainErrorButton", () => {
  beforeEach(() => {
    startAssistantRun.mockClear();
  });

  it("starts a fresh assistant run for the selected error", () => {
    render(
      <InAppAgentExplainErrorButton
        traceId="trace-1"
        observationId="observation-1"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Explain error" }));

    expect(startAssistantRun).toHaveBeenCalledOnce();
    expect(startAssistantRun).toHaveBeenCalledWith({
      source: "trace_error",
      traceId: "trace-1",
      observationId: "observation-1",
    });
  });

  it("passes the explicit trace selection to the assistant", () => {
    render(
      <InAppAgentAnalyzeSelectionButton
        traceIds={["trace-1", "trace-2"]}
        observationIds={[]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Analyze with Assistant" }),
    );

    expect(startAssistantRun).toHaveBeenCalledOnce();
    expect(startAssistantRun).toHaveBeenCalledWith({
      source: "trace_selection",
      traceIds: ["trace-1", "trace-2"],
      observationIds: [],
    });
  });

  it("disables analysis when more than 20 rows are selected", () => {
    render(
      <TooltipProvider>
        <InAppAgentAnalyzeSelectionButton
          traceIds={Array.from({ length: 21 }, (_, index) => `trace-${index}`)}
          observationIds={[]}
        />
      </TooltipProvider>,
    );

    expect(
      screen.getByRole("button", { name: "Analyze with Assistant" }),
    ).toBeDisabled();
  });
});
