import { fireEvent, render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent } from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
import { Form } from "@/src/components/ui/form";
import {
  CreateExperimentData,
  type CreateExperiment,
} from "@/src/features/experiments/types";
import { PromptType } from "@langfuse/shared";

vi.mock("@/src/utils/api", () => ({
  api: {
    datasets: {
      listDatasetVersions: { useQuery: () => ({ data: [] }) },
    },
  },
}));

import { DatasetStep } from "./DatasetStep";

// Regression test for https://github.com/langfuse/langfuse/issues/14719:
// the experiment wizard let users advance past the Dataset step (and
// eventually click "Run Experiment") without ever selecting a dataset, with
// no visible validation error. The fix in MultiStepExperimentForm.tsx makes
// the "Next" button call `form.trigger("datasetId")` before advancing, which
// relies on this FormMessage actually surfacing the zod error. This test
// exercises that mechanism directly against the real form + zod schema,
// without mounting the full wizard (whose default "prompt" step has an
// unrelated pre-existing render-loop issue in this test environment).
const Harness = () => {
  const form = useForm<CreateExperiment>({
    resolver: zodResolver(CreateExperimentData),
    defaultValues: {
      promptId: "prompt-1",
      datasetId: "",
      name: "",
      runName: "",
      modelConfig: { provider: "openai", model: "gpt-4o", modelParams: {} },
    },
  });

  return (
    <Dialog open>
      <DialogContent>
        <Form {...form}>
          <form>
            <DatasetStep
              projectId="project-1"
              formState={{ form }}
              datasetState={{
                datasets: [{ id: "dataset-1", name: "First dataset" }],
                selectedDatasetId: null,
                selectedDataset: undefined,
                selectedDatasetVersion: undefined,
                validationResult: undefined,
                expectedColumnsForDataset: {
                  inputVariables: [],
                  outputVariableType: PromptType.Text,
                  outputVariableName: "expected_output",
                },
              }}
              promptInfo={{
                selectedPromptName: "my-prompt",
                selectedPromptVersion: 1,
              }}
            />
            <Button
              type="button"
              onClick={async () => {
                await form.trigger("datasetId");
              }}
            >
              Next
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

describe("DatasetStep validation (wizard Next-button gating)", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("shows a validation error and does not clear datasetId when Next is clicked without a dataset", async () => {
    render(<Harness />);

    expect(screen.queryByText("Please select a dataset")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    expect(
      await screen.findByText("Please select a dataset"),
    ).toBeInTheDocument();
  });
});
