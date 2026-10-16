import { expect, waitFor, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { AgentOverviewList } from "./AgentOverviewList";
import { DEFAULT_AGENT_OPTIONS } from "../prototype-options/options";
import { agent, FROM, projection, stats, TO } from "./testFixtures";
import { prepareAgents } from "./prepareOverview";

const meta = preview.meta({ component: AgentOverviewList });
const data = projection({
  agents: Array.from({ length: 8 }, (_, index) =>
    agent(`Agent ${String(index + 1).padStart(2, "0")}`, {
      current: stats({
        sessions: index + 1,
        toolInvocations: 3 * (index + 1),
        averageSessionDurationMs: 1500,
      }),
    }),
  ),
});
const args = {
  agents: prepareAgents(data, "all", "name"),
  projection: data,
  scope: {
    projectId: "storybook-agents",
    from: FROM,
    to: TO,
    filter: [],
    prototypeOptions: DEFAULT_AGENT_OPTIONS,
  },
  metrics: DEFAULT_AGENT_OPTIONS.cardMetrics,
};

export const Default = meta.story({ args });

export const ReachEveryAgentInShortViewport = meta.story({
  name: "(Test) Reach Every Agent In Short Viewport",
  args,
  render: (props) => (
    <section
      aria-label="Agents list viewport"
      className="flex h-64 w-full max-w-5xl flex-col"
    >
      <AgentOverviewList {...props} />
    </section>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const viewport = canvas.getByRole("region", {
      name: "Agents list viewport",
    });
    const table = canvas.getByRole("table", { name: "Agent overview" });
    const rows = within(table).getAllByRole("row").slice(1);
    await expect(rows).toHaveLength(8);
    const box = viewport.getBoundingClientRect();
    const visibleRows = rows.filter((row) => {
      const rect = row.getBoundingClientRect();
      return rect.top >= box.top && rect.bottom <= box.bottom + 1;
    });
    await expect(visibleRows.length).toBeGreaterThanOrEqual(3);
    let scrollOwner = table.parentElement;
    while (scrollOwner && scrollOwner !== viewport) {
      if (
        ["auto", "scroll"].includes(getComputedStyle(scrollOwner).overflowY) &&
        scrollOwner.scrollHeight > scrollOwner.clientHeight + 1
      )
        break;
      scrollOwner = scrollOwner.parentElement;
    }
    await expect(scrollOwner).not.toBeNull();
    await expect(scrollOwner).not.toBe(viewport);
    if (!scrollOwner || scrollOwner === viewport)
      throw new Error("The agent rows need their own usable scroll area.");
    scrollOwner.scrollTop = scrollOwner.scrollHeight;
    await waitFor(() => {
      const last = rows.at(-1)!.getBoundingClientRect();
      expect(last.top).toBeGreaterThanOrEqual(box.top);
      expect(last.bottom).toBeLessThanOrEqual(box.bottom + 1);
    });
    await expect(
      within(rows.at(-1)!).getByRole("link", { name: "Agent 08" }),
    ).toBeVisible();
  },
});
