import { expect, fn, waitFor, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { LongestObservationsTooltip } from "./LongestObservationsTooltip";

const observations = [
  { id: "obs-1", name: "Generate content-based", durationMs: 2390 },
  { id: "obs-2", name: "Gather context", durationMs: 710 },
  {
    id: "obs-3",
    name: "Classify using: policy-agents/hss-escalation",
    durationMs: 550,
  },
];

const meta = preview.meta({
  component: LongestObservationsTooltip,
  args: {
    observations,
    traceDurationMs: 6070,
    onSelect: fn(),
    children: <span>6.07s</span>,
  },
});

export const Default = meta.story({});

async function openTooltip(canvasElement: HTMLElement) {
  const trigger = within(canvasElement).getByRole("button", { name: "6.07s" });
  trigger.click();
  await waitFor(() => expect(trigger).toHaveAttribute("aria-describedby"));
  const tooltip = canvasElement.ownerDocument.getElementById(
    trigger.getAttribute("aria-describedby")!,
  );
  if (!tooltip) throw new Error("Tooltip content was not rendered");
  return { trigger, content: within(tooltip) };
}

/**
 * Each row names a leaf observation, states its duration and share of the
 * trace, and the long name keeps its full text in the title.
 */
export const TestListsLeavesWithShares = meta.story({
  name: "(Test) Lists leaves with their share of the trace",
  play: async ({ canvasElement }) => {
    const { content } = await openTooltip(canvasElement);
    await expect(content.getByText("Longest observations")).toBeInTheDocument();
    const links = content.getAllByRole("link");
    await expect(links).toHaveLength(3);
    await expect(links[0]).toHaveTextContent("Generate content-based");
    await expect(content.getByText("2.39s")).toBeInTheDocument();
    await expect(content.getByText("39%")).toBeInTheDocument();
    await expect(content.getByText("9.1%")).toBeInTheDocument();
    await expect(
      content.getByRole("link", {
        name: "Classify using: policy-agents/hss-escalation",
      }),
    ).toHaveAttribute("title", "Classify using: policy-agents/hss-escalation");
    await expect(content.getByText("Trace duration")).toBeInTheDocument();
    await expect(content.getByText("6.07s")).toBeInTheDocument();
  },
});

/** Clicking a row selects that observation once and closes the card. */
export const TestRowClickSelectsAndCloses = meta.story({
  name: "(Test) A row click selects the observation and closes",
  play: async ({ canvasElement, args }) => {
    const { trigger, content } = await openTooltip(canvasElement);
    content.getByRole("link", { name: "Gather context" }).click();
    await expect(args.onSelect).toHaveBeenCalledTimes(1);
    await expect(args.onSelect).toHaveBeenCalledWith("obs-2");
    await waitFor(() =>
      expect(trigger.getAttribute("data-state")).toBe("closed"),
    );
  },
});
