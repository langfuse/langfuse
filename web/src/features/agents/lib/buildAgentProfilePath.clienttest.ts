// @vitest-environment node
import { describe, expect, it } from "vitest";
import { decodeFiltersGeneric, type FilterState } from "@langfuse/shared";
import { buildAgentProfilePath } from "./buildAgentProfilePath";

const window = {
  from: new Date("2026-10-08T08:00:00Z"),
  to: new Date("2026-10-08T12:00:00Z"),
};
const filter: FilterState = [
  {
    column: "environment",
    type: "stringOptions",
    operator: "any of",
    value: ["prod;: / résumé"],
  },
];

describe("buildAgentProfilePath", () => {
  it.each([
    ".",
    "..",
    "research",
    "compose / résumé? v1#",
    "a/../b",
    "%2E",
    "a;b:c",
    "a?b#c",
  ])(
    "preserves the exact agent name %j after browser URL normalization",
    (agentName) => {
      const url = new URL(
        buildAgentProfilePath({
          projectId: "project-1",
          agentName,
          ...window,
          filter,
          tab: "runs",
        }),
        "https://example.test",
      );
      const decodedName =
        url.searchParams.get("agentName") ??
        decodeURIComponent(url.pathname.split("/").at(-1)!);
      expect(decodedName).toBe(agentName);
      expect(url.pathname).toMatch(/^\/project\/project-1\/agents(?:\/|$)/);
      expect(url.searchParams.get("dateRange")).toBe(
        `${window.from.getTime()}-${window.to.getTime()}`,
      );
      expect(
        decodeFiltersGeneric(url.searchParams.get("filter") ?? ""),
      ).toEqual(filter);
      expect(url.searchParams.get("tab")).toBe("runs");
    },
  );
});
