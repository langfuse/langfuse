import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ComponentProps, type ReactNode } from "react";
import { vi } from "vitest";

import { NewDatasetItemForm } from "./NewDatasetItemForm";
import { NewDatasetItemFromExistingObjectDialogController } from "./NewDatasetItemFromExistingObjectDialogController";

const { query, generateExample, createItems } = vi.hoisted(() => ({
  query: {
    data: undefined as
      | {
          id: string;
          name: string;
          inputSchema: { type: string; default: string };
          expectedOutputSchema: { type: string; default: string };
        }[]
      | undefined,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
  generateExample: vi.fn<(schema: { default: string }) => Promise<string>>(),
  createItems: vi.fn(),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    datasets: {
      allDatasetMeta: { useQuery: () => query },
      createManyDatasetItems: {
        useMutation: () => ({ mutateAsync: createItems, isPending: false }),
      },
    },
    useUtils: () => ({ datasets: { invalidate: vi.fn() } }),
  },
  reportTrpcErrorWithoutToast: vi.fn(),
}));
vi.mock("../lib/generateSchemaExample", () => ({
  generateSchemaExample: generateExample,
}));
vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => vi.fn(),
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
vi.mock("@/src/components/editor/mediaTagWidget", () => ({
  useMediaTagChips: () => ({ extension: [], portals: null }),
}));
vi.mock("../hooks/useDatasetItemMediaUpload", () => ({
  useDatasetItemMediaUpload: () => ({
    uploadFile: vi.fn(),
    pendingUploads: [],
  }),
}));
vi.mock("./DatasetItemMediaAttachments", () => ({
  createMediaDropPasteExtension: () => [],
  DatasetItemFieldToolbar: () => <span />,
  DatasetItemFormMediaAttachments: () => <span />,
  insertMediaReferenceAtCursor: vi.fn(),
}));
vi.mock("./DatasetSchemaHoverCard", () => ({
  DatasetSchemaHoverCard: () => <span />,
}));
vi.mock(
  "@/src/components/design-system/MultiSelectTagInput/MultiSelectTagInput",
  () => ({
    MultiSelectTagInput: ({
      value,
      options,
      onValueChange,
      disabled,
    }: {
      value: string[];
      options: { value: string; label: string }[];
      onValueChange: (value: string[]) => void;
      disabled?: boolean;
    }) => (
      <select
        aria-label="Target datasets"
        multiple
        disabled={disabled}
        value={value}
        onChange={(event) =>
          onValueChange(
            Array.from(
              event.target.selectedOptions,
              (option) => option.value,
            ).filter(Boolean),
          )
        }
      >
        <option value="">Choose dataset</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    ),
  }),
);

vi.mock("./DatasetForm", () => ({
  DatasetForm: ({
    onCreateDatasetSuccess,
    onCancel,
  }: {
    onCreateDatasetSuccess: (dataset: unknown) => void;
    onCancel?: () => void;
  }) => (
    <div>
      <button type="button" onClick={onCancel}>
        Back to item
      </button>
      <button
        type="button"
        onClick={() =>
          onCreateDatasetSuccess({
            id: "created",
            name: "Created dataset",
            inputSchema: null,
            expectedOutputSchema: null,
          })
        }
      >
        Finish creating dataset
      </button>
    </div>
  ),
}));

const datasets = ["a", "b"].map((id) => ({
  id,
  name: `Dataset ${id}`,
  inputSchema: { type: "string", default: `${id} input` },
  expectedOutputSchema: { type: "string", default: `${id} output` },
}));

function renderForm(
  props: Partial<ComponentProps<typeof NewDatasetItemForm>> = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<NewDatasetItemForm projectId="project" {...props} />, {
    wrapper,
  });
}

describe("NewDatasetItemForm schema defaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.data = datasets;
    query.isPending = false;
    query.isError = false;
    generateExample.mockImplementation(async (schema) =>
      JSON.stringify(schema.default),
    );
    createItems.mockResolvedValue({ success: true });
  });

  it("keeps deliberately cleared fields empty when dataset metadata refetches", async () => {
    const { rerender } = renderForm({ datasetId: "a" });
    const input = await screen.findByLabelText("Input");
    const output = screen.getByLabelText("Expected output");
    await waitFor(() => expect(input).toHaveValue('"a input"'));
    await waitFor(() => expect(output).toHaveValue('"a output"'));

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.change(output, { target: { value: "" } });
    query.data = datasets.map((dataset) => ({ ...dataset }));
    await act(async () =>
      rerender(<NewDatasetItemForm projectId="project" datasetId="a" />),
    );

    expect(screen.getByLabelText("Input")).toBe(input);
    expect(input).toHaveValue("");
    expect(output).toHaveValue("");

    await act(async () =>
      fireEvent.change(screen.getByLabelText("Target datasets"), {
        target: { value: "b" },
      }),
    );
    expect(input).toHaveValue("");
    expect(output).toHaveValue("");
  });

  it("does not overwrite a field edited and cleared while an example is generating", async () => {
    let resolveInput!: (value: string) => void;
    generateExample.mockImplementation((schema) =>
      schema.default === "a input"
        ? new Promise((resolve) => {
            resolveInput = resolve;
          })
        : Promise.resolve(JSON.stringify(schema.default)),
    );
    renderForm();
    const input = await screen.findByLabelText("Input");
    fireEvent.change(screen.getByLabelText("Target datasets"), {
      target: { value: "a" },
    });
    fireEvent.change(input, { target: { value: '"draft"' } });
    fireEvent.change(input, { target: { value: "" } });
    await act(async () => resolveInput('"a input"'));

    expect(input).toHaveValue("");
    expect(screen.getByLabelText("Expected output")).toHaveValue('"a output"');
  });

  it("autofills a newly selected dataset and ignores an obsolete selection", async () => {
    let resolveInput!: (value: string) => void;
    generateExample.mockImplementation((schema) =>
      schema.default.startsWith("a")
        ? new Promise((resolve) => {
            if (schema.default === "a input") resolveInput = resolve;
          })
        : Promise.resolve(JSON.stringify(schema.default)),
    );
    renderForm();
    await screen.findByLabelText("Input");
    const picker = screen.getByLabelText("Target datasets");
    fireEvent.change(picker, { target: { value: "a" } });
    fireEvent.change(picker, { target: { value: "b" } });
    await waitFor(() =>
      expect(screen.getByLabelText("Input")).toHaveValue('"b input"'),
    );
    await act(async () => resolveInput('"a input"'));

    expect(screen.getByLabelText("Input")).toHaveValue('"b input"');
    expect(screen.getByLabelText("Expected output")).toHaveValue('"b output"');
  });

  it("mounts the form only after the initially selected dataset examples are ready", async () => {
    query.data = undefined;
    query.isPending = true;
    let resolveInput!: (value: string) => void;
    generateExample.mockImplementation((schema) =>
      schema.default === "a input"
        ? new Promise((resolve) => {
            resolveInput = resolve;
          })
        : Promise.resolve(JSON.stringify(schema.default)),
    );
    const { rerender } = renderForm({ datasetId: "a" });
    expect(screen.queryByLabelText("Input")).not.toBeInTheDocument();
    query.data = datasets;
    query.isPending = false;
    rerender(<NewDatasetItemForm projectId="project" datasetId="a" />);
    expect(screen.queryByLabelText("Input")).not.toBeInTheDocument();
    await waitFor(() => expect(generateExample).toHaveBeenCalledTimes(2));
    await act(async () => resolveInput('"a input"'));

    expect(await screen.findByLabelText("Input")).toHaveValue('"a input"');
    expect(screen.getByLabelText("Expected output")).toHaveValue('"a output"');
  });

  it("keeps editable source values and provenance when adding to multiple datasets", async () => {
    renderForm({
      datasetId: "a",
      traceId: "trace",
      observationId: "observation",
      input: "source input",
      output: "source output",
    });
    expect(await screen.findByLabelText("Input")).toHaveValue('"source input"');
    const selector = screen.getByLabelText(
      "Target datasets",
    ) as HTMLSelectElement;
    selector.options[2].selected = true;
    fireEvent.change(selector);
    fireEvent.change(screen.getByLabelText("Expected output"), {
      target: { value: '"Reviewed answer"' },
    });
    fireEvent.change(screen.getByLabelText("Metadata"), {
      target: { value: '{"reviewed":true}' },
    });
    expect(generateExample).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Add to 2 datasets" }));

    await waitFor(() =>
      expect(createItems).toHaveBeenCalledWith({
        projectId: "project",
        items: ["a", "b"].map((datasetId) =>
          expect.objectContaining({
            datasetId,
            sourceTraceId: "trace",
            sourceObservationId: "observation",
            input: '"source input"',
            expectedOutput: '"Reviewed answer"',
            metadata: '{"reviewed":true}',
          }),
        ),
      }),
    );
  });

  it("returns from dataset creation with the item draft and adds the new target", async () => {
    renderForm({ datasetId: "a", input: "source", output: "answer" });
    fireEvent.change(await screen.findByLabelText("Input"), {
      target: { value: '"reviewed draft"' },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create dataset" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to item" }));
    expect(screen.getByLabelText("Input")).toHaveValue('"reviewed draft"');
    fireEvent.click(screen.getByRole("button", { name: "Create dataset" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Finish creating dataset" }),
    );
    expect(screen.getByLabelText("Input")).toHaveValue('"reviewed draft"');
    expect(screen.getByLabelText("Target datasets")).toHaveValue([
      "a",
      "created",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Add to 2 datasets" }));
    await waitFor(() =>
      expect(createItems).toHaveBeenCalledWith(
        expect.objectContaining({
          items: ["a", "created"].map((datasetId) =>
            expect.objectContaining({ datasetId, input: '"reviewed draft"' }),
          ),
        }),
      ),
    );
  });

  it("keeps the submitting item open and immutable, then preserves its draft on failure", async () => {
    let rejectSubmission!: (error: Error) => void;
    createItems.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectSubmission = reject;
        }),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <NewDatasetItemFromExistingObjectDialogController projectId="project">
          {({ openDialog }) => (
            <button
              onClick={() =>
                openDialog({
                  traceId: "trace",
                  observationId: "observation",
                  input: "source",
                  output: "answer",
                  metadata: null,
                })
              }
            >
              Open dataset item
            </button>
          )}
        </NewDatasetItemFromExistingObjectDialogController>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open dataset item" }));
    const input = await screen.findByLabelText("Input");
    fireEvent.change(screen.getByLabelText("Target datasets"), {
      target: { value: "a" },
    });
    fireEvent.change(input, { target: { value: '"draft"' } });
    fireEvent.click(screen.getByRole("button", { name: "Add to dataset" }));
    await waitFor(() => expect(createItems).toHaveBeenCalledTimes(1));
    expect(input).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Target datasets")).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.submit(input.closest("form")!);
    expect(createItems).toHaveBeenCalledTimes(1);
    await act(async () => rejectSubmission(new Error("Temporary failure")));
    expect(input).not.toHaveAttribute("readonly");
    expect(input).toHaveValue('"draft"');
    expect(screen.getByLabelText("Target datasets")).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Add to dataset" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(createItems).toHaveBeenCalledTimes(2);
  });
});
