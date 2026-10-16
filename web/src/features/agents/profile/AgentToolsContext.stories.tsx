import { type AgentProjectionTool } from "@langfuse/shared";
import preview from "../../../../.storybook/preview";
import { projection, TO } from "../overview/testFixtures";
import { AgentToolsContext } from "./AgentToolsContext";

const meta = preview.meta({ component: AgentToolsContext });

const tools = [
  {
    agentName: "research",
    name: "search_sources",
    invocations: 24,
    sessions: 6,
    traces: 6,
    lastUsed: TO,
    available: true,
  },
  {
    agentName: "research",
    name: "load_skill",
    invocations: 6,
    sessions: 6,
    traces: 6,
    lastUsed: TO,
    available: false,
  },
  {
    agentName: "research",
    name: "export_findings",
    invocations: 0,
    sessions: 0,
    traces: 0,
    lastUsed: null,
    available: true,
  },
] satisfies AgentProjectionTool[];

export const Default = meta.story({
  args: { agentName: "research", projection: projection({ tools }) },
});

export const NoActivity = meta.story({
  args: { agentName: "research", projection: projection() },
});

export const PartialCoverage = meta.story({
  args: {
    agentName: "research",
    projection: projection({
      tools,
      coverage: { ...projection().coverage, groupsTruncated: true },
    }),
  },
});
