import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ExperimentEvaluatorAssignments } from "./ExperimentEvaluatorAssignments";

const queryMocks = vi.hoisted(() => ({
  datasetItem: vi.fn(),
  historicalEvents: vi.fn(),
  historicalEventDetails: vi.fn(),
  assignmentsEditor: vi.fn(),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    datasets: { itemsByDatasetId: { useQuery: queryMocks.datasetItem } },
    events: {
      all: { useQuery: queryMocks.historicalEvents },
      experimentBatchIO: { useQuery: queryMocks.historicalEventDetails },
    },
  },
  sendAsPostOption: {},
}));

vi.mock("@/src/features/evals", () => ({
  buildSelectedSampleObject: () => ({}),
}));

vi.mock(
  "@/src/features/experiments/components/ExperimentEvaluatorAssignments/components/ExperimentEvaluatorAssignmentsEditor/ExperimentEvaluatorAssignmentsEditor",
  () => ({
    ExperimentEvaluatorAssignmentsEditor: (props: unknown) => {
      queryMocks.assignmentsEditor(props);
      return <div>Assignments editor</div>;
    },
  }),
);

describe("ExperimentEvaluatorAssignments", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T12:00:00.000Z"));
    queryMocks.datasetItem.mockReturnValue({
      data: undefined,
      isPending: true,
    });
    queryMocks.historicalEvents.mockReturnValue({
      data: {
        observations: [
          {
            id: "event-1",
            traceId: "trace-1",
            startTime: new Date("2026-08-17T12:00:00.000Z"),
          },
        ],
      },
      isPending: false,
    });
    queryMocks.historicalEventDetails.mockReturnValue({
      data: [{}],
      isPending: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("loads recent history before falling back to a dataset item", () => {
    render(
      <ExperimentEvaluatorAssignments
        projectId="project-1"
        datasetId="dataset-1"
        evaluatorOptions={[]}
        initialAssignments={[]}
        search=""
        onSearchChange={vi.fn()}
        onSaveAssignments={vi.fn()}
      />,
    );

    expect(queryMocks.historicalEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: expect.arrayContaining([
          {
            column: "startTime",
            type: "datetime",
            operator: ">=",
            value: new Date("2026-08-11T12:00:00.000Z"),
          },
        ]),
      }),
    );
    expect(queryMocks.datasetItem).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ enabled: false }),
    );
    expect(queryMocks.assignmentsEditor).toHaveBeenCalledWith(
      expect.objectContaining({ unvalidatedSourceColumnIds: [] }),
    );
    expect(screen.getByText("Assignments editor")).toBeInTheDocument();
  });

  it("loads a dataset item when no recent history exists", () => {
    queryMocks.historicalEvents.mockReturnValue({
      data: { observations: [] },
      isPending: false,
    });
    queryMocks.datasetItem.mockReturnValue({
      data: { datasetItems: [] },
      isPending: false,
    });

    render(
      <ExperimentEvaluatorAssignments
        projectId="project-1"
        datasetId="dataset-1"
        evaluatorOptions={[]}
        initialAssignments={[]}
        search=""
        onSearchChange={vi.fn()}
        onSaveAssignments={vi.fn()}
      />,
    );

    expect(queryMocks.datasetItem).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ enabled: true }),
    );
    expect(queryMocks.assignmentsEditor).toHaveBeenCalledWith(
      expect.objectContaining({ unvalidatedSourceColumnIds: ["output"] }),
    );
    expect(screen.getByText("Assignments editor")).toBeInTheDocument();
  });
});
