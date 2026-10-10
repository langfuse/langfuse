import type { TranscriptFixture } from "../fixture-types";

export const toolsOnlyFixture = {
  name: "Tool observations alone do not create a transcript",
  description:
    "An execute tool and its search child have no generation to establish a thread.",
  observations: [
    {
      id: "execute",
      name: "execute",
      parent_observation_id: null,
      input: JSON.stringify({ code: "search('docs')" }),
      output: JSON.stringify("done"),
    },
    {
      id: "search",
      name: "search",
      parent_observation_id: "execute",
      input: JSON.stringify({ query: "docs" }),
      output: JSON.stringify("Found docs"),
    },
  ].map((observation) => ({
    ...observation,
    project_id: "transcript-fixture-project",
    trace_id: "tools-only",
    type: "TOOL" as const,
    start_time: "2026-01-01T12:00:00.000Z",
    end_time: "2026-01-01T12:00:01.000Z",
  })),
  expected: null,
} satisfies TranscriptFixture;
