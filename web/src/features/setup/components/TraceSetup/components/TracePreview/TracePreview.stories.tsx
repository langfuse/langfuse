import { expect, userEvent, within } from "storybook/test";
import preview from "@/.storybook/preview";
import { receiptOf } from "../../firstTrace";
import { TracePreview } from "./TracePreview";
import {
  agentTurn,
  appTrace,
  errorTrace,
  largeTrace,
  spansOnlyTrace,
} from "./TracePreview.fixtures";

const meta = preview.meta({
  component: TracePreview,
});

export const AppTrace = meta.story({
  args: { receipt: receiptOf(appTrace) },
});

export const SpansOnly = meta.story({
  args: { receipt: receiptOf(spansOnlyTrace) },
});

export const ListsTopTools = meta.story({
  name: "(Test) A coding agent's turn lists the tools it called most",
  args: { receipt: receiptOf(agentTurn) },
  play: async ({ canvasElement }) => {
    const tools = within(
      within(canvasElement).getByRole("list", { name: "Tools it called most" }),
    );
    await expect(
      tools.getAllByRole("listitem").map((item) => item.textContent),
    ).toEqual(["Read ×6", "Edit ×5", "Bash ×3"]);
  },
});

export const ShowsTheError = meta.story({
  name: "(Test) A failed step shows its error",
  args: { receipt: receiptOf(errorTrace) },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(
        "429 Too Many Requests: rate limit reached for gpt-4o-mini",
      ),
    ).toBeVisible();
  },
});

export const CountsHiddenSteps = meta.story({
  name: "(Test) A large trace counts the steps it hides",
  args: { receipt: receiptOf(largeTrace) },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText("+36 more steps"),
    ).toBeVisible();
  },
});

export const ExplainsHowToReadIt = meta.story({
  name: "(Test) The reading guide explains each part",
  args: { receipt: receiptOf(appTrace) },
  play: async ({ canvasElement }) => {
    await userEvent.hover(
      within(canvasElement).getByRole("button", { name: /^Retriever: / }),
    );
    await expect(
      await within(canvasElement.ownerDocument.body).findByText(
        "Looks something up, like a vector store or database.",
      ),
    ).toBeInTheDocument();
  },
});
