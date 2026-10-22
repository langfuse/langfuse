import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { vi } from "vitest";
import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import { AddObservationsToDatasetDialog } from "./index";

const { submit, submitted, previewQuery } = vi.hoisted(() => ({
  submit: vi.fn<() => Promise<{ id: string }>>(),
  submitted: vi.fn(),
  previewQuery: vi.fn(() => ({
    data: {
      id: "first",
      input: { question: "Example" },
      output: "Answer",
      metadata: {},
    },
    isLoading: false,
  })),
}));

vi.mock("@/src/utils/api", () => ({
  sendAsPostOption: {},
  api: {
    datasets: {
      allDatasetMeta: {
        useQuery: () => ({
          data: [
            {
              id: "dataset",
              name: "Review examples",
              inputSchema: null,
              expectedOutputSchema: null,
            },
          ],
          isLoading: false,
        }),
      },
    },
    events: {
      batchIO: { useQuery: () => ({ data: undefined, isLoading: false }) },
    },
    observations: { byId: { useQuery: previewQuery } },
    batchAction: {
      addToDataset: {
        create: {
          useMutation: (options: { onError: (error: Error) => void }) => ({
            mutateAsync: async () => {
              try {
                const data = await submit();
                return data;
              } catch (error) {
                options.onError(error as Error);
                throw error;
              }
            },
          }),
        },
      },
    },
  },
}));
vi.mock("@/src/features/notifications", () => ({ showErrorToast: vi.fn() }));
vi.mock("@/src/components/ui/combobox", () => ({
  Combobox: ({ onValueChange }: { onValueChange: (value: string) => void }) => (
    <button onClick={() => onValueChange("dataset")}>Use dataset</button>
  ),
}));
vi.mock("./DatasetCreateStep", () => ({
  DatasetCreateStep: () => <div />,
}));
vi.mock("./MappingStep", () => ({ MappingStep: () => <div /> }));
vi.mock("@/src/components/ui/CodeJsonViewer", () => ({
  JSONView: ({ json }: { json: unknown }) => <pre>{JSON.stringify(json)}</pre>,
}));
vi.mock("./StatusStep", () => ({
  StatusStep: ({
    expectedCount,
    onClose,
  }: {
    expectedCount: number;
    onClose: () => void;
  }) => (
    <div>
      <p>{expectedCount} observations submitted</p>
      <button onClick={onClose}>Close progress</button>
    </div>
  ),
}));

function SelectionHarness() {
  const [open, setOpen] = useState(true);
  const [selectedIds, setSelectedIds] = useState(["first", "second"]);
  const props = {
    projectId: "project",
    selectedObservationIds: selectedIds,
    query: { filter: [], orderBy: null },
    selectAll: false,
    totalCount: 10,
    isV4: false,
    exampleObservation: { id: selectedIds[0] ?? "", traceId: "trace" },
    onClose: () => setOpen(false),
    onSuccess: () => {
      submitted();
      setSelectedIds([]);
    },
  };
  return (
    <LayerProvider>
      <p>{selectedIds.length} rows selected</p>
      {open && <AddObservationsToDatasetDialog {...props} />}
    </LayerProvider>
  );
}

function prepareSubmission() {
  fireEvent.click(screen.getByRole("button", { name: "Use dataset" }));
}

describe("Add observations to dataset lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submit.mockResolvedValue({ id: "batch-action" });
  });

  it("dismisses without completing the action or changing the selected rows", () => {
    render(<SelectionHarness />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("2 rows selected")).toBeInTheDocument();
    expect(submitted).not.toHaveBeenCalled();
  });

  it("clears selection once after submission and keeps its original progress context", async () => {
    render(<SelectionHarness />);
    prepareSubmission();
    fireEvent.click(screen.getByRole("button", { name: "Add 2 observations" }));
    await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1));
    expect(screen.getByText("0 rows selected")).toBeInTheDocument();
    expect(screen.getByText("2 observations submitted")).toBeInTheDocument();
    expect(previewQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ observationId: "first" }),
      expect.anything(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Close progress" }));
    expect(submitted).toHaveBeenCalledTimes(1);
  });

  it("keeps the draft and selection after a rejected submission, then allows retry", async () => {
    submit.mockRejectedValueOnce(new Error("Temporarily unavailable"));
    render(<SelectionHarness />);
    prepareSubmission();
    fireEvent.click(screen.getByRole("button", { name: "Add 2 observations" }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submitted).not.toHaveBeenCalled();
    expect(screen.getByText("2 rows selected")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add 2 observations" }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Add 2 observations" }));
    await waitFor(() => expect(submitted).toHaveBeenCalledTimes(1));
  });
});
