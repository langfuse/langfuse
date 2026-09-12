// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { FilterState } from "@langfuse/shared";
import { EVENTS_FIELD_REGISTRY } from "@/src/features/search-bar/lib/fields";
import { planCommit } from "@/src/features/search-bar/lib/commit";
import { filterStateToQueryText } from "@/src/features/search-bar/lib/filter-state-to-query";
import { runSearchBarInvariants } from "@/src/features/search-bar/lib/searchBarInvariants";
import { eventsSearchRegistry } from "./eventsSearchRegistry";

describe("events search scope", () => {
  it("preserves the full-page grammar and AI capability", () => {
    expect(eventsSearchRegistry([])).toBe(EVENTS_FIELD_REGISTRY);
  });

  it("keeps remaining fields' meaning while closing host-owned fields and aliases", () => {
    const registry = eventsSearchRegistry([
      "userId",
      "sessionId",
      "promptName",
      "promptVersion",
    ]);
    expect(registry.aiFilterPrompt).toBe(false);
    for (const field of [
      "userId",
      "user_id",
      "sessionId",
      "session_id",
      "promptName",
      "promptVersion",
    ])
      expect(registry.resolveField(field)).toBeNull();
    expect(planCommit("name:checkout", undefined, registry)).toMatchObject({
      status: "committed",
      filters: [
        {
          type: "string",
          column: "name",
          operator: "contains",
          value: "checkout",
        },
      ],
    });
    expect(planCommit("name:checkout", undefined, registry)).toEqual(
      planCommit("name:checkout", undefined, EVENTS_FIELD_REGISTRY),
    );
  });

  it("preserves hidden saved conditions without rendering broken tokens", () => {
    const registry = eventsSearchRegistry(["sessionId"]);
    const hidden: FilterState = [
      {
        type: "string",
        column: "sessionId",
        operator: "=",
        value: "parent-session",
      },
    ];
    const projection = filterStateToQueryText(hidden, {}, registry);
    expect(projection.text).toBe("");
    expect(projection.skippedFilters).toEqual(hidden);
    expect(planCommit("sessionId:other", undefined, registry).status).toBe(
      "invalid",
    );
  });

  it("keeps scoped validation and lowering aligned for supported facets", () => {
    const registry = eventsSearchRegistry([
      "userId",
      "promptName",
      "promptVersion",
    ]);
    expect(
      runSearchBarInvariants({
        name: "scoped events",
        registry,
        extraKeys: ["metadata.region", "scores.quality", "has:userId"],
        scoreContexts: [],
        fieldValues: ["checkout", "ERROR", "true", "false", "0.5", "or", "a,b"],
        freeTextValues: ["refund policy", "or", "!important"],
        sidebarFilters: [
          [
            {
              type: "string",
              column: "userId",
              operator: "=",
              value: "parent-user",
            },
          ],
        ],
      }),
    ).toEqual([]);
  });
});
