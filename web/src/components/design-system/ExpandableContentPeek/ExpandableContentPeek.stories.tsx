import preview from "@/.storybook/preview";
import { ExpandableContentPeek } from "./ExpandableContentPeek";

const meta = preview.meta({ component: ExpandableContentPeek });

const paragraphs = Array.from({ length: 8 }, (_, index) => (
  <p key={index} className="text-sm">
    Step {index + 1}: configure the client, then verify the connection before
    moving on to the next step.
  </p>
));

export const Overflowing = meta.story({
  args: {
    expandLabel: "Show all steps",
    children: <div className="flex max-w-md flex-col gap-3">{paragraphs}</div>,
  },
});

export const FitsWithoutPeek = meta.story({
  args: {
    expandLabel: "Show all steps",
    children: <p className="max-w-md text-sm">Short content renders as is.</p>,
  },
});
