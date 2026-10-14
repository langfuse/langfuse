import { expect, fn, userEvent, within } from "storybook/test";
import preview from "../../../.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import {
  type TopicExecutionStatus,
  type TopicFacet,
} from "@langfuse/shared/topics";
import {
  RegenerateTopicsButton,
  RegenerateTopicsDialog,
} from "./RegenerateTopicsDialog";

const facet = (id: string, name: string): TopicFacet => ({
  id,
  projectId: "project",
  name,
  description: "",
  isBuiltIn: true,
  versions: [
    {
      projectId: "project",
      facetId: id,
      version: 1,
      prompt: "",
      createdAt: "2026-10-01T00:00:00Z",
    },
  ],
});
const facets = [
  { ...facet("intent", "Intent"), summaries: 240 },
  { ...facet("outcome", "Outcome"), summaries: 64 },
  { ...facet("issues", "Issues"), summaries: 0 },
].map(({ summaries, ...item }) => ({
  facet: item,
  version: item.versions[0]!,
  summaries,
}));
const run = (status: TopicExecutionStatus, hoursAgo: number) => ({
  id: "run",
  status,
  createdAt: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
});

const meta = preview.meta({
  component: RegenerateTopicsDialog,
  args: {
    facets,
    timeRange: {
      from: new Date("2026-10-06T16:00:00"),
      to: new Date("2026-10-13T16:00:00"),
    },
    lastRun: run("completed", 3),
    disabledReason: null,
    isSubmitting: false,
    error: null,
    onSubmit: fn(),
    onOpenRun: fn(),
  },
  decorators: [
    (Story) => (
      <DialogController
        initialState={() => true}
        renderDialog={() => <Story />}
      >
        {() => null}
      </DialogController>
    ),
  ],
});

export const Ready = meta.story({});

export const FirstRun = meta.story({
  args: { lastRun: null },
});

export const LastRunFailed = meta.story({
  args: {
    lastRun: run("failed", 26),
    error: "Topics processing is not enabled for this project.",
  },
});

export const BlockedWhileOpen = meta.story({
  args: {
    lastRun: run("running", 0.1),
    disabledReason: "A Topics run is in progress. Regenerate when it finishes.",
  },
});

export const SubmitsSelectedFacets = meta.story({
  name: "(Test) Submits facets with summaries and the advanced settings",
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getByRole("checkbox", { name: "Issues" })).toBeDisabled();
    await expect(
      body.getByText(/Outcome has fewer than 100/),
    ).toBeInTheDocument();
    await userEvent.click(body.getByRole("button", { name: "Advanced" }));
    await userEvent.click(body.getByRole("checkbox", { name: /Small sample/ }));
    await expect(body.queryByText(/Outcome has fewer than/)).toBeNull();
    await userEvent.click(
      body.getByRole("button", { name: "Regenerate topics" }),
    );
    await expect(args.onSubmit).toHaveBeenCalledWith({
      facets: [
        { facetId: "intent", version: 1 },
        { facetId: "outcome", version: 1 },
      ],
      exploratory: true,
      minimumTraceCount: 10,
    });
  },
});

const entryPointReasons = [
  null,
  "No trace summaries in the selected time range yet. Summarize traces first, then regenerate.",
  "Topics is paused. The LLM connection \u201copenai\u201d was deleted. Choose another connection and turn Topics on again.",
  "A Topics run is in progress. Regenerate when it finishes.",
  "You need permission to manage Topics in this project to regenerate topics.",
];

export const EntryPointStates = meta.story({
  decorators: [(Story) => <Story />],
  render: () => (
    <div className="flex flex-col gap-3 p-4 text-sm">
      {entryPointReasons.map((reason) => (
        <div key={reason ?? "enabled"} className="flex items-center gap-4">
          <RegenerateTopicsButton disabledReason={reason} onClick={fn()} />
          <span className="text-muted-foreground">
            {reason ?? "Enabled: summaries exist and nothing is running."}
          </span>
        </div>
      ))}
    </div>
  ),
});
