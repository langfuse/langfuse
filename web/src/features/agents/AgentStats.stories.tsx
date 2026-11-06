import preview from "../../../.storybook/preview";
import { agent, projection, stats } from "./overview/testFixtures";
import { AgentStats } from "./AgentStats";

const meta = preview.meta({ component: AgentStats });

export const Default = meta.story({
  args: {
    agentName: "research",
    projection: projection({
      agents: [
        agent("research", {
          current: stats({
            sessions: 24,
            toolInvocations: 144,
            averageSessionDurationMs: 125_000,
            cost: 1.24,
            tokens: 48_000,
            invocations: 30,
            traces: 27,
            observations: 210,
          }),
        }),
      ],
    }),
  },
});

export const NoActivity = meta.story({
  args: { agentName: "research", projection: projection() },
});
