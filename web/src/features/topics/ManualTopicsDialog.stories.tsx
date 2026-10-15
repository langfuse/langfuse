import { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import preview from "../../../.storybook/preview";
import { Button } from "@/src/components/design-system/Button/Button";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import {
  ManualTopicsDialog,
  type ManualTopicsDialogProps,
} from "./ManualTopicsDialog";

const facets: ManualTopicsDialogProps["facets"] = [
  {
    id: "intent",
    name: "Intent",
    summaries: 240,
    kind: "Built-in",
    version: 1,
    description: "What the user wants to accomplish.",
  },
  {
    id: "outcome",
    name: "Outcome",
    summaries: 24,
    kind: "Built-in",
    version: 1,
    description: "How the conversation ended.",
  },
  {
    id: "product",
    name: "Product area",
    summaries: 180,
    kind: "Custom",
    version: 2,
    description: "Which part of the product the conversation concerns.",
  },
];

const defaults: ManualTopicsDialogProps = {
  operation: "process",
  facets,
  selectedFacetIds: facets.map((facet) => facet.id),
  traceControls: <p>100 matching traces selected.</p>,
  count: 100,
  generationTimeRange: { range: "last7Days" },
  models: {
    summary: { model: "gpt-4.1-mini", connection: "OpenAI" },
    embedding: { model: "text-embedding-3-small", connection: "OpenAI" },
    clustering: { model: "gpt-4.1-mini", connection: "OpenAI" },
  },
  reuse: true,
  smallSample: false,
  canSubmit: true,
  isSubmitting: false,
  disabledReason: null,
  error: null,
  onOperationChange: fn(),
  onToggleFacet: fn(),
  onGenerationTimeRangeChange: fn(),
  onReuseChange: fn(),
  onSmallSampleChange: fn(),
  onSubmit: fn(),
  onConfigure: fn(),
};

const meta = preview.meta({
  component: ManualTopicsDialog,
  parameters: { layout: "fullscreen" },
  args: defaults,
  render: function DialogStory(args) {
    const [draft, setDraft] = useState({
      operation: args.operation,
      selectedFacetIds: args.selectedFacetIds,
      reuse: args.reuse,
      smallSample: args.smallSample,
      generationTimeRange: args.generationTimeRange,
    });
    function handleOperationChange(
      operation: ManualTopicsDialogProps["operation"],
    ) {
      setDraft((current) => ({ ...current, operation }));
      args.onOperationChange(operation);
    }
    function handleToggleFacet(id: string, selected: boolean) {
      setDraft((current) => ({
        ...current,
        selectedFacetIds: selected
          ? current.selectedFacetIds.concat(id)
          : current.selectedFacetIds.filter((value) => value !== id),
      }));
      args.onToggleFacet(id, selected);
    }
    function handleReuseChange(reuse: boolean) {
      setDraft((current) => ({ ...current, reuse }));
      args.onReuseChange(reuse);
    }
    function handleSmallSampleChange(smallSample: boolean) {
      setDraft((current) => ({ ...current, smallSample }));
      args.onSmallSampleChange(smallSample);
    }
    function handleTimeRangeChange(
      generationTimeRange: ManualTopicsDialogProps["generationTimeRange"],
    ) {
      setDraft((current) => ({ ...current, generationTimeRange }));
      args.onGenerationTimeRangeChange(generationTimeRange);
    }
    return (
      <DialogController
        initialState={() => true}
        renderDialog={() => (
          <ManualTopicsDialog
            {...args}
            {...draft}
            onOperationChange={handleOperationChange}
            onToggleFacet={handleToggleFacet}
            onReuseChange={handleReuseChange}
            onSmallSampleChange={handleSmallSampleChange}
            onGenerationTimeRangeChange={handleTimeRangeChange}
          />
        )}
      >
        {({ openDialog }) => {
          function handleOpen() {
            openDialog(true);
          }
          return <Button text="Open manual processing" onClick={handleOpen} />;
        }}
      </DialogController>
    );
  },
});

export default meta;

export const SummarizeTraces = meta.story({});
export const GenerateTopics = meta.story({ args: { operation: "update" } });
export const NoSummaries = meta.story({
  args: {
    operation: "update",
    facets: facets.map((facet) => ({ ...facet, summaries: 0 })),
    canSubmit: false,
  },
});
export const SubmissionError = meta.story({
  args: {
    error:
      "Could not start the run. Check your model connection and try again.",
  },
});

export const ReviewChoices = meta.story({
  name: "(Test) Review choices across steps and operations",
  play: async ({ canvasElement, args }) => {
    const dialog = within(canvasElement.ownerDocument.body).getByRole(
      "dialog",
      { name: "Manual processing" },
    );
    const view = within(dialog);
    await userEvent.click(view.getByRole("checkbox", { name: "Intent" }));
    await expect(args.onToggleFacet).toHaveBeenCalledWith("intent", false);
    await waitFor(() =>
      expect(
        view.getByRole("button", { name: "Step 1: Choose facets" }),
      ).toHaveTextContent("2 of 3 selected"),
    );
    await userEvent.click(
      view.getByRole("button", { name: "Step 1: Choose facets" }),
    );
    await userEvent.click(
      view.getByRole("button", { name: "Step 1: Choose facets" }),
    );
    await expect(
      view.getByRole("checkbox", { name: "Intent" }),
    ).not.toBeChecked();
    await userEvent.click(
      view.getByRole("checkbox", {
        name: "Reuse existing summaries and embeddings",
      }),
    );
    await expect(args.onReuseChange).toHaveBeenCalledWith(false);
    await expect(
      view.getByText(/Fresh results incur model costs/),
    ).toBeVisible();
    await userEvent.click(view.getByRole("tab", { name: "Generate topics" }));
    await expect(args.onOperationChange).toHaveBeenCalledWith("update");
    await expect(
      view.getByRole("checkbox", { name: "Intent" }),
    ).not.toBeChecked();
    await userEvent.click(
      view.getByRole("switch", { name: "Small sample mode" }),
    );
    await expect(args.onSmallSampleChange).toHaveBeenCalledWith(true);
    await expect(view.queryByText(/will be skipped/)).not.toBeInTheDocument();
    await userEvent.click(
      view.getByRole("tab", { name: "Summarize traces & embed" }),
    );
    await expect(
      view.getByRole("checkbox", {
        name: "Reuse existing summaries and embeddings",
      }),
    ).not.toBeChecked();
  },
});
