import preview from "../../../../../../.storybook/preview";
import { expect, fn, screen, within } from "storybook/test";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { ObservationDetailViewHeader } from "./ObservationDetailViewHeader";

const observation = {
  id: "observation-id",
  name: "Observation name",
  type: "SPAN",
  startTime: new Date("2026-08-12T00:00:00.000Z"),
  level: "DEFAULT",
  providedCostDetails: {},
} as unknown as ObservationReturnTypeWithMetadata;

const meta = preview.meta({
  component: ObservationDetailViewHeader,
});

const defaultArgs = {
  observation,
  projectId: "project-id",
  latencySeconds: null,
  subtreeMetrics: null,
  treeNodeTotalCost: undefined,
  isAnnotationMode: false,
  isMobile: false,
  optionsMenu: <button>Options menu</button>,
  datasetAction: {
    type: "menu" as const,
    disabled: false,
    datasetItems: [
      {
        id: "dataset-item-id",
        datasetId: "dataset-id",
        datasetName: "Evaluation dataset",
      },
    ],
    onOpenDialog: fn(),
  },
  annotationAction: {
    disabled: false,
    onClick: fn(),
  },
  annotationQueueAction: {
    disabled: false,
    totalCount: 1,
    queues: [
      {
        id: "queue-id",
        name: "Review queue",
        itemId: "queue-item-id",
      },
    ],
    onQueueItemToggle: fn(),
  },
  playgroundMenu: <button>Playground menu</button>,
  commentAction: {
    disabled: false,
    count: 2,
    onClick: fn(),
  },
};

export const Desktop = meta.story({
  name: "(Test) Desktop",
  args: defaultArgs,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Observation name")).toBeVisible();
    await expect(canvas.getByText("Options menu")).toBeVisible();
    await expect(canvas.getByText("In 1 dataset(s)")).toBeVisible();
    await expect(canvas.getByText("Annotate")).toBeVisible();
    await expect(canvas.getByText("Add comment")).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "More actions" }),
    ).not.toBeInTheDocument();
  },
});

export const Mobile = meta.story({
  name: "(Test) Mobile",
  args: {
    ...defaultArgs,
    isMobile: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "More actions" }),
    ).toBeVisible();
    await expect(screen.getByText("In 1 dataset(s)")).toBeInTheDocument();
    await expect(screen.getByText("Annotate")).toBeInTheDocument();
    await expect(screen.getByText("Add comment")).toBeInTheDocument();
  },
});

export const AnnotationMode = meta.story({
  name: "(Test) Annotation Mode",
  args: {
    ...defaultArgs,
    isAnnotationMode: true,
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByText("Latency"),
    ).not.toBeInTheDocument();
  },
});
