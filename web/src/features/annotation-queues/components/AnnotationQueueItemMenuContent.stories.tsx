import preview from "../../../../.storybook/preview";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { expect, fn, userEvent, within } from "storybook/test";

import {
  AnnotationQueueItemMenuContent,
  type AnnotationQueueItemMenuQueue,
} from "./AnnotationQueueItemMenuContent";

const meta = preview.meta({
  component: AnnotationQueueItemMenuContent,
});

const queues: AnnotationQueueItemMenuQueue[] = [
  { id: "queue-1", name: "Support review", status: "ACTIVE" },
  {
    id: "queue-2",
    name: "Quality audit",
    itemId: "item-2",
    status: "COMPLETED",
  },
];

export const WithQueues = meta.story({
  render: (args) => (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger>Open queues</DropdownMenuTrigger>
      <AnnotationQueueItemMenuContent {...args} />
    </DropdownMenu>
  ),
  args: {
    projectId: "project-1",
    queues,
    onQueueItemToggle: fn(),
  },
});

export const Empty = meta.story({
  render: (args) => (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger>Open queues</DropdownMenuTrigger>
      <AnnotationQueueItemMenuContent {...args} />
    </DropdownMenu>
  ),
  args: {
    projectId: "project-1",
    queues: [],
    onQueueItemToggle: fn(),
  },
});

export const QueueCanBeToggled = meta.story({
  name: "(Test) Toggles Queue",
  render: (args) => (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger>Open queues</DropdownMenuTrigger>
      <AnnotationQueueItemMenuContent {...args} />
    </DropdownMenu>
  ),
  args: {
    projectId: "project-1",
    queues,
    onQueueItemToggle: fn(),
  },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("menuitemcheckbox", {
        name: /Support review/,
      }),
    );
    await expect(args.onQueueItemToggle).toHaveBeenCalledWith(
      "queue-1",
      "Support review",
      undefined,
    );
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("menuitemcheckbox", {
        name: /Quality audit/,
      }),
    );
    await expect(args.onQueueItemToggle).toHaveBeenCalledWith(
      "queue-2",
      "Quality audit",
      "item-2",
    );
  },
});
