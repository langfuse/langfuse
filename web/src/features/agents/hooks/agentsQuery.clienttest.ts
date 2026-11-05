import { AGENT_LIMITS, type AgentScope } from "@langfuse/shared/agents";
import {
  agentCost,
  agentDuration,
  agentNumber,
  agentPage,
  agentProfilePath,
  agentWindow,
} from "./agentsQuery";

const now = new Date("2026-11-05T12:00:00Z").getTime();
const scope: AgentScope = {
  projectId: "project",
  from: new Date(now - 3600000),
  to: new Date(now),
  environment: "all / production",
};

describe("Agent query boundaries", () => {
  it("maps human URL pages to the zero-based API and table indexes", () => {
    expect(agentPage(undefined)).toBe(0);
    expect(agentPage("1")).toBe(0);
    expect(agentPage("2")).toBe(1);
    expect(agentPage("-1")).toBe(0);
    expect(agentPage("1.5")).toBe(0);
    expect(agentPage(String(AGENT_LIMITS.maxPage + 100))).toBe(
      AGENT_LIMITS.maxPage,
    );
  });
  it("keeps identity kind, exact raw value and closed scope through URL normalization", () => {
    for (const value of [".", "..", "research / résumé?#", "worker%2Fone"]) {
      for (const kind of ["id", "name"] as const) {
        const url = new URL(
          agentProfilePath(scope, { kind, value }),
          "https://example.test",
        );
        expect(url.searchParams.get("identityKind")).toBe(kind);
        expect(url.searchParams.get("environment")).toBe(scope.environment);
        expect(url.searchParams.get("dateRange")).toBe(
          `${scope.from.getTime()}-${scope.to.getTime()}`,
        );
        expect(
          url.searchParams.get("agentId") ??
            decodeURIComponent(url.pathname.split("/").at(-1)!),
        ).toBe(value);
        expect(url.pathname.startsWith("/project/project/agents")).toBe(true);
      }
    }
  });

  it("defaults to seven closed days and blocks malformed or oversized windows", () => {
    const initial = agentWindow(undefined, now);
    expect(initial.error).toBeNull();
    expect(initial.window.to.getTime()).toBe(now);
    expect(initial.window.to.getTime() - initial.window.from.getTime()).toBe(
      7 * 86400000,
    );
    const max = AGENT_LIMITS.maxWindowDays * 86400000;
    expect(agentWindow(`${now - max}-${now}`, now).error).toBeNull();
    for (const value of [
      "allTime",
      "broken",
      `${now}-${now}`,
      `${now}-${now - 1}`,
      `${now - max - 1}-${now}`,
    ])
      expect(agentWindow(value, now).error).not.toBeNull();
  });

  it("keeps absent measurements distinct from observed zero values", () => {
    expect(agentCost(null)).toBe("Unknown");
    expect(agentCost(0)).toBe("$0.00");
    expect(agentNumber(null)).toBe("Unknown");
    expect(agentNumber(0)).toBe("0");
    expect(agentDuration(null)).toBe("Unknown");
    expect(agentDuration(0)).toBe("0 ms");
  });
});
