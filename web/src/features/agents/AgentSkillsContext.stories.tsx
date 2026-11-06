import preview from "../../../.storybook/preview";
import { agent, projection } from "./overview/testFixtures";
import { AgentSkillsContext } from "./AgentSkillsContext";

const meta = preview.meta({ component: AgentSkillsContext });

export const Default = meta.story({
  args: {
    agentName: "research",
    projection: projection({
      agents: [
        agent("research", {
          availableSkillNames: ["source-discovery", "evidence-ranking"],
        }),
      ],
    }),
  },
});

export const NoDeclarations = meta.story({
  args: { agentName: "research", projection: projection() },
});
