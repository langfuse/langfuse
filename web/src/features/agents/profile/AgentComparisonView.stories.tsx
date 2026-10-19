import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { agent, projection, session, stats } from "../overview/testFixtures";
import { AgentComparisonSparkline } from "../overview/AgentComparisonSparkline";
import { AgentComparisonView } from "./AgentComparisonView";

const meta = preview.meta({ component: AgentComparisonView });
const summary = agent("compose", {
  comparisonStatus: "ready",
  baseline: stats({ averageToolsPerSession: 4, completeSessions: 24 }),
  recent: stats({ averageToolsPerSession: 0, completeSessions: 6 }),
  excludedSessions: 1,
});
const data = projection({
  agents: [summary],
  sessions: Array.from({ length: 30 }, (_, index) =>
    session(`session-${index}`, {
      agentName: "compose",
      comparisonPeriod: index < 24 ? "baseline" : "recent",
      toolInvocations: index < 24 ? 4 : 0,
    }),
  ),
});
const args = {
  agent: summary,
  recentWindow: data.recentWindow,
  baselineWindow: data.baselineWindow,
  chart: (
    <AgentComparisonSparkline
      agent={summary}
      projection={data}
      color="#6366f1"
    />
  ),
  onSelectSignal: fn(),
};

export const Default = meta.story({ args });

export const InsufficientSessions = meta.story({
  args: {
    ...args,
    agent: agent("compose", {
      recent: stats({ averageToolsPerSession: 0, completeSessions: 2 }),
    }),
    chart: null,
  },
});

export const WithSignals = meta.story({
  args: {
    ...args,
    agent: {
      ...summary,
      signals: [
        {
          kind: "tool-change",
          message:
            "Executed tools per complete session changed by more than 2×.",
          sessionIds: ["session-24"],
        },
        {
          kind: "missing-tools",
          message:
            "At least half of recent complete sessions used no tools; at least 90% of baseline sessions used tools.",
          sessionIds: ["session-24"],
        },
      ],
    },
  },
});

export const DisclosureAndInspect = meta.story({
  name: "(Test) Disclosure And Inspect",
  args: { ...WithSignals.input.args, onSelectSignal: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Historical comparison")).toBeVisible();
    await expect(canvas.getByText(/6 qualifying sessions/)).toBeVisible();
    await expect(canvas.getByText(/24 qualifying sessions/)).toBeVisible();
    await expect(canvas.getByText("0.0")).toBeVisible();
    await expect(canvas.getByText("4.0")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Inspect tool change" }),
    ).toBeVisible();
    const trigger = canvas.getByRole("button", { name: "Comparison details" });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(
      canvas.queryByText(/Includes zero-tool sessions/),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Inspect missing tools" }),
    );
    await expect(args.onSelectSignal).toHaveBeenCalledWith("missing-tools");
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(canvas.getByText(/Includes zero-tool sessions/)).toBeVisible();
    await expect(canvas.getByText("Recent window")).toBeVisible();
    await expect(canvas.getByText("Baseline window")).toBeVisible();
    await expect(
      canvas.getByText(/At least half of recent complete sessions/),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Inspect missing tools" }),
    );
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(args.onSelectSignal).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(
        canvas.queryByText(/Includes zero-tool sessions/),
      ).not.toBeInTheDocument(),
    );
    await expect(canvas.getByText("Historical comparison")).toBeVisible();
  },
});
