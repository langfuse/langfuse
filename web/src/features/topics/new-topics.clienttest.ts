import { describe, expect, it } from "vitest";
import { newTopicsBadge, seenTopicRuns, type NewTopicRun } from "./new-topics";

const run = (
  ruleId: string,
  facetId: string,
  runId: string,
  newTopicCount: number,
): NewTopicRun => ({
  ruleId,
  facetId,
  facetName: facetId === "intent" ? "Intent" : "Issues",
  runId,
  newTopicCount,
});

describe("newTopicsBadge", () => {
  const runs = [
    run("all", "intent", "run-1", 2),
    run("enterprise", "intent", "run-2", 3),
    run("all", "issues", "run-3", 1),
  ];

  it("counts facets with unseen new topics, or one facet's topics from its busiest map", () => {
    expect(newTopicsBadge(runs, {})).toEqual({
      count: 2,
      description: "New topics in 2 facets",
    });
    const issuesSeen = { "all:issues": "run-3" };
    expect(newTopicsBadge(runs, issuesSeen)).toEqual({
      count: 3,
      description: "3 new topics in Intent",
    });
    expect(newTopicsBadge(runs, seenTopicRuns(runs))).toBeNull();
    // The next refit is unseen again.
    expect(
      newTopicsBadge([run("all", "issues", "run-4", 1)], seenTopicRuns(runs)),
    ).toEqual({ count: 1, description: "1 new topic in Issues" });
  });
});
