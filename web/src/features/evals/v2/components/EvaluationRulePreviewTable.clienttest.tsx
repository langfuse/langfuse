import { useEffect, useState } from "react";
import { render, waitFor } from "@testing-library/react";

import { type EventsTableRow } from "@/src/features/events/components/EventsTable";

const mocks = vi.hoisted(() => ({
  tableRenderCount: 0,
}));

const previewRows = [
  {
    id: "observation-1",
    traceId: "trace-1",
    name: "generation",
    startTime: new Date("2026-07-20T12:00:00.000Z"),
  },
] as EventsTableRow[];

vi.mock("@/src/features/events/components/EventsTable", () => ({
  default: function EventsTableMock({
    onExternalRowsChange,
  }: {
    onExternalRowsChange?: (rows: EventsTableRow[]) => void;
  }) {
    useEffect(() => {
      mocks.tableRenderCount += 1;
      if (mocks.tableRenderCount <= 5) {
        onExternalRowsChange?.(previewRows);
      }
    });
    return <div>Events table</div>;
  },
}));

import { EvaluationRulePreviewTable } from "./EvaluationRulePreviewTable";

function StateDerivingParent({ onRows }: { onRows: () => void }) {
  const [, setRows] = useState<EventsTableRow[]>([]);

  return (
    <EvaluationRulePreviewTable
      projectId="project-1"
      filterState={[]}
      timeRange={null}
      onRowsChange={(rows) => {
        onRows();
        setRows([...rows]);
      }}
    />
  );
}

describe("EvaluationRulePreviewTable", () => {
  beforeEach(() => {
    mocks.tableRenderCount = 0;
  });

  it("does not forward equivalent row reports after its parent re-renders", async () => {
    const onRows = vi.fn();

    render(<StateDerivingParent onRows={onRows} />);

    await waitFor(() => expect(mocks.tableRenderCount).toBeGreaterThan(1));
    expect(onRows).toHaveBeenCalledOnce();
  });
});
