import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { vi } from "vitest";
import { DatasetForm } from "./DatasetForm";

const { createDataset, updateDataset, push } = vi.hoisted(() => ({
  createDataset: vi.fn(),
  updateDataset: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    datasets: {
      allDatasetMeta: { useQuery: () => ({ data: [] }) },
      createDataset: { useMutation: () => ({ mutateAsync: createDataset }) },
      updateDataset: { useMutation: () => ({ mutateAsync: updateDataset }) },
    },
    useUtils: () => ({ datasets: { invalidate: vi.fn() } }),
  },
  reportNonTrpcError: vi.fn(),
}));
vi.mock("next/router", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));
vi.mock("@/src/hooks/useUniqueNameValidation", () => ({
  useUniqueNameValidation: vi.fn(),
}));
vi.mock("@/src/components/editor", () => ({
  CodeMirrorEditor: ({
    id,
    value,
    onChange,
    editable = true,
  }: {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    editable?: boolean;
  }) => (
    <textarea
      id={id}
      value={value}
      readOnly={!editable}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));
vi.mock("./DatasetSchemaInput", () => ({ DatasetSchemaInput: () => null }));
vi.mock("./DatasetSchemaValidationError", () => ({
  DatasetSchemaValidationError: () => null,
}));

describe("DatasetForm submission ownership", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the creation draft on failure and unlocks before returning the new dataset", async () => {
    let rejectSubmission!: (error: Error) => void;
    createDataset.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectSubmission = reject;
        }),
    );
    const pending = vi.fn();
    const cancel = vi.fn();
    const created = vi.fn(() =>
      expect(pending).toHaveBeenLastCalledWith(false),
    );
    render(
      <DatasetForm
        projectId="project"
        mode="create"
        redirectOnSuccess={false}
        onSubmittingChange={pending}
        onCancel={cancel}
        onCreateDatasetSuccess={created}
      />,
    );
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Review dataset" },
    });
    fireEvent.change(screen.getByLabelText("Metadata (optional)"), {
      target: { value: '{"reviewed":true}' },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create dataset" }));
    await waitFor(() => expect(createDataset).toHaveBeenCalledTimes(1));
    expect(pending).toHaveBeenLastCalledWith(true);
    expect(screen.getByLabelText("Name")).toBeDisabled();
    expect(screen.getByLabelText("Metadata (optional)")).toHaveAttribute(
      "readonly",
    );
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    fireEvent.submit(screen.getByLabelText("Name").closest("form")!);
    await act(async () => rejectSubmission(new Error("Temporary failure")));
    expect(screen.getByRole("alert")).toHaveTextContent("Temporary failure");
    expect(screen.getByLabelText("Name")).toHaveValue("Review dataset");
    expect(screen.getByLabelText("Name")).not.toBeDisabled();
    expect(createDataset).toHaveBeenCalledTimes(1);
    expect(created).not.toHaveBeenCalled();
    const dataset = {
      id: "created",
      name: "Review dataset",
      inputSchema: null,
      expectedOutputSchema: null,
    };
    createDataset.mockResolvedValueOnce({ success: true, dataset });
    fireEvent.click(screen.getByRole("button", { name: "Create dataset" }));
    await waitFor(() => expect(created).toHaveBeenCalledWith(dataset));
    expect(createDataset).toHaveBeenLastCalledWith({
      projectId: "project",
      name: "Review dataset",
      description: null,
      metadata: '{"reviewed":true}',
      inputSchema: null,
      expectedOutputSchema: null,
    });
    expect(push).not.toHaveBeenCalled();
  });
});
