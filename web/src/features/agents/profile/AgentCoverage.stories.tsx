import { type AgentSessionProjection } from "@langfuse/shared";
import preview from "../../../../.storybook/preview";
import { AgentCoverage } from "./AgentCoverage";

const meta = preview.meta({ component: AgentCoverage });

const coverage = {
  source: "metadata-preview",
  agentLimit: 25,
  sessionLimit: 500,
  rowLimit: 20_000,
  groupsLimit: 50,
  agentsTruncated: false,
  sessionsTruncated: false,
  rowsTruncated: false,
  groupsTruncated: false,
  historyComplete: true,
  missingSessionTraces: 0,
  unlinkedObservations: 0,
  incompleteSessions: 0,
  inputTruncated: true,
  settledMinutes: 5,
} satisfies AgentSessionProjection["coverage"];

export const Default = meta.story({ args: { coverage } });

export const PartialCoverage = meta.story({
  args: {
    coverage: {
      ...coverage,
      sessionsTruncated: true,
      historyComplete: false,
      missingSessionTraces: 3,
      incompleteSessions: 2,
    },
  },
});
