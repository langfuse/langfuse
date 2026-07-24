import { useEffect, useState } from "react";
import { render, waitFor } from "@testing-library/react";

import { type EventsTableRow } from "@/src/features/events/components/EventsTable";

const mocks = vi.hoisted(() => ({
  tableRenderCount: 0,
  localStorageKeys: [] as string[],
  tableStorageKeySuffixes: [] as Array<string | undefined>,
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
    tableStateStorageKeySuffix,
  }: {
    onExternalRowsChange?: (rows: EventsTableRow[]) => void;
    tableStateStorageKeySuffix?: string;
  }) {
    mocks.tableStorageKeySuffixes.push(tableStateStorageKeySuffix);
    useEffect(() => {
      mocks.tableRenderCount += 1;
      if (mocks.tableRenderCount <= 5) {
        onExternalRowsChange?.(previewRows);
      }
    });
    return <div>Events table</div>;
  },
}));

vi.mock("@/src/components/useLocalStorage", () => ({
  default: (key: string, initialValue: unknown) => {
    mocks.localStorageKeys.push(key);
    return [initialValue, vi.fn(), vi.fn()];
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
    mocks.localStorageKeys = [];
    mocks.tableStorageKeySuffixes = [];
  });

  it("does not forward equivalent row reports after its parent re-renders", async () => {
    const onRows = vi.fn();

    render(<StateDerivingParent onRows={onRows} />);

    await waitFor(() => expect(mocks.tableRenderCount).toBeGreaterThan(1));
    expect(onRows).toHaveBeenCalledOnce();
  });

  it("isolates column visibility when two previews are mounted", () => {
    render(
      <>
        <EvaluationRulePreviewTable
          projectId="project-1"
          filterState={[]}
          timeRange={null}
          columnVisibilityStorageKeySuffix="evaluator-setup"
        />
        <EvaluationRulePreviewTable
          projectId="project-1"
          filterState={[]}
          timeRange={null}
          columnVisibilityStorageKeySuffix="create-rule"
        />
      </>,
    );

    expect(new Set(mocks.localStorageKeys)).toEqual(
      new Set([
        "evaluationRulePreviewColumns-v2-project-1-evaluator-setup",
        "evaluationRulePreviewColumns-v2-project-1-create-rule",
      ]),
    );
    expect(new Set(mocks.tableStorageKeySuffixes)).toEqual(
      new Set(["evaluator-setup", "create-rule"]),
    );
  });
});
