import { AGENT_LIMITS, type AgentScope } from "@langfuse/shared/agents";
import { decodeFiltersGeneric, encodeFiltersGeneric } from "@langfuse/shared";
import {
  agentCost,
  agentDuration,
  agentNumber,
  agentPage,
  agentProfilePath,
  agentWindow,
  agentTabQuery,
} from "./agentsQuery";
import { normalizeAgentEnvironmentUrl } from "../server/agentRoute";

const now = new Date("2026-11-05T12:00:00Z").getTime();
const scope: AgentScope = {
  projectId: "project",
  from: new Date(now - 3600000),
  to: new Date(now),
  environment: "all / production",
};

describe("Agent query boundaries", () => {
  it("keeps visible environment predicates across tabs while leaving other filters behind", () => {
    const environments = [
      {
        column: "environment",
        type: "stringOptions" as const,
        operator: "any of" as const,
        value: ["production", "staging"],
      },
      {
        column: "environment",
        type: "string" as const,
        operator: "does not contain" as const,
        value: "preview",
      },
    ];
    const next = agentTabQuery(
      {
        tab: "traces",
        filter: encodeFiltersGeneric([
          ...environments,
          {
            column: "name",
            type: "string",
            operator: "contains",
            value: "generate",
          },
        ]),
        dateRange: "meta:last7Days",
        search: "a prompt",
      },
      "sessions",
    );
    expect(decodeFiltersGeneric(next.filter as string)).toEqual(environments);
    expect(next.dateRange).toBe("meta:last7Days");
    expect(next.search).toBeUndefined();
  });

  it("redirects legacy environment links to the visible native filter exactly once", () => {
    const url =
      "/project/project/agents/worker?identityKind=id&environment=production&dateRange=meta:last7Days";
    const destination = normalizeAgentEnvironmentUrl(url);
    const normalized = new URL(destination!, "https://example.test");
    expect(normalized.searchParams.has("environment")).toBe(false);
    expect(
      decodeFiltersGeneric(normalized.searchParams.get("filter")!),
    ).toEqual([
      {
        column: "environment",
        type: "stringOptions",
        operator: "any of",
        value: ["production"],
      },
    ]);
    expect(normalized.searchParams.get("identityKind")).toBe("id");
    expect(normalizeAgentEnvironmentUrl(destination!)).toBeNull();

    normalized.searchParams.set("environment", "production");
    normalized.searchParams.set("filter", "");
    const cleared = new URL(
      normalizeAgentEnvironmentUrl(normalized.pathname + normalized.search)!,
      "https://example.test",
    );
    expect(cleared.searchParams.get("filter")).toBe("");
    expect(cleared.searchParams.has("environment")).toBe(false);
  });

  it("preserves the legacy environment alongside unrelated table filters", () => {
    const level = {
      column: "level",
      type: "stringOptions" as const,
      operator: "any of" as const,
      value: ["ERROR"],
    };
    const url = new URL(
      "/project/project/agents/worker?environment=production",
      "https://example.test",
    );
    url.searchParams.set("filter", encodeFiltersGeneric([level]));
    const redirected = new URL(
      normalizeAgentEnvironmentUrl(url.pathname + url.search)!,
      url,
    );
    expect(
      decodeFiltersGeneric(redirected.searchParams.get("filter")!),
    ).toEqual([
      level,
      {
        column: "environment",
        type: "stringOptions",
        operator: "any of",
        value: ["production"],
      },
    ]);
  });
  it("leaves trace root filters and table state behind when opening another activity tab", () => {
    const parentScope = {
      projectId: "project",
      agentId: "worker / one",
      identityKind: "id",
      dateRange: `${scope.from.getTime()}-${scope.to.getTime()}`,
      environment: scope.environment!,
    };
    const traceQuery = {
      ...parentScope,
      tab: "traces",
      filter: encodeFiltersGeneric([
        {
          column: "isRootObservation",
          type: "boolean",
          operator: "=",
          value: true,
        },
      ]),
      viewId: "root-observations",
      search: "trace-name",
      searchType: ["id"],
      orderBy: "startTime_DESC",
      page: "4",
      limit: "50",
      peek: "root-span",
      traceId: "source-trace",
      observation: "root-span",
    };
    for (const tab of ["tools", "invocations", "sessions"]) {
      expect(agentTabQuery(traceQuery, tab)).toEqual({ ...parentScope, tab });
    }
  });
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
        expect(decodeFiltersGeneric(url.searchParams.get("filter")!)).toEqual([
          {
            column: "environment",
            type: "stringOptions",
            operator: "any of",
            value: [scope.environment],
          },
        ]);
        expect(url.searchParams.has("environment")).toBe(false);
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
    expect(
      agentWindow({ from: new Date(now - max), to: new Date(now) }, now).error,
    ).toBeNull();
    expect(agentWindow({ range: "last7Days" }, now).window).toEqual(
      initial.window,
    );
    for (const value of [
      { range: "allTime" },
      { from: new Date(NaN), to: new Date(now) },
      { from: new Date(now), to: new Date(now) },
      { from: new Date(now), to: new Date(now - 1) },
      { from: new Date(now - max - 1), to: new Date(now) },
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
