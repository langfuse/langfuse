/// <reference types="vitest/importMeta" />
/**
 * PROTOTYPE — THROWAWAY, does not merge (branch `prototype/parity-classification`,
 * LFE-15559). One shared runtime parity classifier over all four enforcement
 * seams: a `recordParity` core (authn/authz 2×2 + resolution allowlist) plus a
 * `new → Verdict` mapper keyed on error type, fed by one thin legacy probe per
 * seam. Proves each seam surfaces both verdicts as values at one point, per the
 * LFE-15034 contract. Findings live in the ticket.
 * Run: `pnpm --filter web run test:in-source parity.prototype`.
 */

import { type BaseError } from "@langfuse/shared";
import { getCurrentSpan, recordIncrement } from "@langfuse/shared/src/server";
import { type Action } from "./policy.prototype";

/** parityStat is the confusion counter; coverageStat the exhaustive per-request denominator. */
const parityStat = "langfuse.authz.parity";
const coverageStat = "langfuse.authz.coverage";

/** newErrorLayer keys the failed layer off the new pipeline's error type — the uniform `new → Verdict` mapper the contract names. */
const newErrorLayer: Record<string, Layer> = {
  UnauthorizedError: "authn",
  InvalidRequestError: "resolution",
  ForbiddenError: "authz",
};

/** layerOrder is the new pipeline's short-circuit order; a terminal deny allows every layer before it and leaves every layer after absent. */
const layerOrder: readonly Layer[] = ["authn", "resolution", "authz"];

/** defaultSink writes to dogstatsd and the active span; tests inject a capturing fake. */
const defaultSink: ParitySink = {
  increment: (stat, tags) => recordIncrement(stat, 1, tags),
  span: () => getCurrentSpan(),
};

/** recordParity classifies one layer's legacy-vs-new verdicts and emits `langfuse.authz.parity`; authn/authz run the 2×2 confusion matrix, resolution the LFE-15149 allowlist. */
export function recordParity(
  input: ParityInput,
  sink: ParitySink = defaultSink,
): ParityClassification {
  const cell =
    input.layer === "resolution"
      ? classifyResolution(input.legacy, input.neu, input.resolutionShift)
      : classifyMatrix(input.legacy, input.neu);
  const legacyOpinion: LegacyOpinion =
    input.legacy === "absent" ? "absent" : "bearing";
  const tags = {
    layer: input.layer,
    cell,
    seam: input.seam,
    action: input.action ?? "none",
    legacy_opinion: legacyOpinion,
    new_code: httpCodeOf(input.neu, input.newCode),
    legacy_code: httpCodeOf(input.legacy, input.legacyCode),
  } satisfies Record<string, string | number>;
  sink.increment(parityStat, tags);
  const stamped = stampParity(tags, sink);
  return { layer: input.layer, seam: input.seam, cell, legacyOpinion, stamped };
}

/** recordCoverage increments `langfuse.authz.coverage` once per request, tagged by operation; a zero is a dead-route finding for a human, never an auto-gate. */
export function recordCoverage(
  operation: string,
  sink: ParitySink = defaultSink,
): void {
  sink.increment(coverageStat, { operation });
}

/** newOpinions decomposes a new-pipeline result into per-layer opinions over the layers this seam evaluates: a success allows each; a failure denies at its error's layer, allows the layers before, and leaves the layers after absent. */
export function newOpinions(
  result: NewResult,
  layers: readonly Layer[],
): Record<Layer, Opinion> {
  const verdict = absentVerdict();
  if (result.success) {
    for (const layer of layers) verdict[layer] = "allow";
    return verdict;
  }
  const failed = newErrorLayer[result.error.name] ?? "authz";
  for (const layer of layers) {
    if (rank(layer) < rank(failed)) verdict[layer] = "allow";
    else if (layer === failed) verdict[layer] = "deny";
  }
  return verdict;
}

/** legacyProjectVerdict surfaces `verifyApiKeyAuth`'s outcome as per-layer opinions: 401 → authn, and the two 403s split by message into authz vs resolution — the seam's one brittle spot, a string match no type guards. */
export function legacyProjectVerdict(
  outcome: LegacyThrow | LegacyOk,
): Record<Layer, Opinion> {
  if (outcome.ok) return { authn: "allow", resolution: "allow", authz: "allow" };
  const verdict = absentVerdict();
  if (outcome.status === 401) {
    verdict.authn = "deny";
    return verdict;
  }
  verdict.authn = "allow";
  if (/project id not found|organization key/i.test(outcome.message)) {
    verdict.resolution = "deny";
    return verdict;
  }
  verdict.resolution = "allow";
  verdict.authz = "deny";
  return verdict;
}

/** legacyOrgVerdict surfaces the inlined org gate — `verifyAuthHeaderAndReturnScope` then the `accessLevel === "organization"` check — as per-layer opinions; the `admin-api` entitlement 403 stays outside, identical on both paths. */
export function legacyOrgVerdict(
  outcome: LegacyOrgOutcome,
): Record<Layer, Opinion> {
  const verdict = absentVerdict();
  if (!outcome.validKey) {
    verdict.authn = "deny";
    return verdict;
  }
  verdict.authn = "allow";
  verdict.authz =
    outcome.accessLevel === "organization" && outcome.orgId ? "allow" : "deny";
  return verdict;
}

/** reconstructLegacyIngestionAuthz models legacy's per-event authz verdict as a pure fn of `(accessLevel, eventType, suspension)` — not read from the 207, which mixes validation into an overcount; sdk-log and unknown types carry no authz opinion. */
export function reconstructLegacyIngestionAuthz(params: {
  accessLevel: "project" | "scores";
  eventType: string;
  suspended: boolean;
}): Opinion {
  const family = ingestionFamily(params.eventType);
  if (family === "other") return "absent";
  if (params.suspended) return "deny";
  if (params.accessLevel === "scores" && family === "trace") return "deny";
  return "allow";
}

/** legacyMcpConnectionVerdict surfaces the one real legacy MCP opinion, captured once at session auth: a project-scoped key is required and an mcp-suspended org refused. */
export function legacyMcpConnectionVerdict(outcome: {
  validKey: boolean;
  accessLevel?: string;
  mcpSuspended?: boolean;
}): Record<Layer, Opinion> {
  const verdict = absentVerdict();
  if (!outcome.validKey) {
    verdict.authn = "deny";
    return verdict;
  }
  verdict.authn = "allow";
  verdict.authz =
    outcome.accessLevel === "project" && !outcome.mcpSuspended
      ? "allow"
      : "deny";
  return verdict;
}

/** legacyMcpToolVerdict is `absent` by construction: legacy runs zero per-tool auth, so every per-tool assertion has no legacy verdict to bear. */
export function legacyMcpToolVerdict(): Opinion {
  return "absent";
}

/** classifyMatrix classifies a confusion layer (authn/authz); positive = allow. An absent legacy takes an implicit-allow baseline, so a net-new deny reads as `fn` under the `absent` qualifier the tag carries. */
function classifyMatrix(legacy: Opinion, neu: Opinion): Cell {
  const base: Opinion = legacy === "absent" ? "allow" : legacy;
  if (neu === "allow") return base === "allow" ? "tp" : "fp";
  return base === "allow" ? "fn" : "tn";
}

/** classifyResolution runs the resolution allowlist: agreement is `expected`, an allowlisted LFE-15149 shift is `expected`, any other divergence is `unexpected`. */
function classifyResolution(
  legacy: Opinion,
  neu: Opinion,
  shift?: ResolutionShift,
): Cell {
  if (legacy === neu) return "expected";
  if (neu === "deny" && shift) return "expected";
  return "unexpected";
}

/** stampParity writes the payload onto the active http.server span; returns false when no span exists — the mcp_tool gap, where a tool call runs in ServerContext outside a request. */
function stampParity(
  tags: Record<string, string | number>,
  sink: ParitySink,
): boolean {
  const span = sink.span();
  if (!span) return false;
  for (const [key, value] of Object.entries(tags)) {
    span.setAttribute(`${parityStat}.${key}`, value);
  }
  return true;
}

/** ingestionFamily buckets an ingestion event type into the authz family legacy gated on. */
function ingestionFamily(eventType: string): "trace" | "score" | "other" {
  if (eventType === "score-create") return "score";
  if (/^(trace|event|span|generation|observation)-/.test(eventType))
    return "trace";
  return "other";
}

/** absentVerdict is the all-absent per-layer verdict every probe starts from. */
function absentVerdict(): Record<Layer, Opinion> {
  return { authn: "absent", resolution: "absent", authz: "absent" };
}

/** rank orders a layer within the pipeline short-circuit sequence. */
function rank(layer: Layer): number {
  return layerOrder.indexOf(layer);
}

/** httpCodeOf resolves the status a path's opinion reports: an explicit code, else 200 allow / 403 deny / 0 absent. */
function httpCodeOf(opinion: Opinion, explicit?: number): number {
  if (explicit !== undefined) return explicit;
  if (opinion === "allow") return 200;
  if (opinion === "absent") return 0;
  return 403;
}

/** Polarity is a bearing verdict: allow (positive) or deny (negative). */
type Polarity = "allow" | "deny";

/** Opinion is a path's verdict at one layer: a bearing polarity, or absent where that path runs no gate there. */
type Opinion = Polarity | "absent";

/** Layer is the pipeline stage a verdict belongs to. */
type Layer = "authn" | "resolution" | "authz";

/** Seam identifies the enforcement point a decision came from. */
type Seam =
  | "project_route"
  | "org_route"
  | "mcp_access"
  | "mcp_tool"
  | "ingestion_event";

/** Cell is a confusion classification (authn/authz) or an allowlist verdict (resolution). */
type Cell = "tp" | "tn" | "fp" | "fn" | "expected" | "unexpected";

/** LegacyOpinion tags whether legacy bore a verdict at this layer or had no gate. */
type LegacyOpinion = "bearing" | "absent";

/** ResolutionShift names the LFE-15149 status shifts that are the only expected resolution divergences. */
type ResolutionShift = "header_disagreement_400" | "outside_grant_404";

/** NewResult is the new pipeline's outcome at a decision point — its `Success | ErrorResult<AuthError>` shape, minus the payload the mapper ignores. */
type NewResult = { success: true } | { success: false; error: BaseError };

/** ParityInput is one layer's legacy-vs-new verdicts plus the tags the counter carries. */
type ParityInput = {
  layer: Layer;
  seam: Seam;
  action?: Action | null;
  legacy: Opinion;
  neu: Opinion;
  newCode?: number;
  legacyCode?: number;
  resolutionShift?: ResolutionShift;
};

/** ParityClassification is `recordParity`'s return: the classified cell and whether it reached a span. */
type ParityClassification = {
  layer: Layer;
  seam: Seam;
  cell: Cell;
  legacyOpinion: LegacyOpinion;
  stamped: boolean;
};

/** ParitySink is the telemetry surface the classifier writes to; defaults to dogstatsd + the active span, injectable so tests capture without a collector. */
type ParitySink = {
  increment: (stat: string, tags: Record<string, string | number>) => void;
  span: () =>
    | { setAttribute: (key: string, value: string | number) => void }
    | undefined;
};

/** LegacyThrow is what `verifyApiKeyAuth` throws: an http status and a message the probe reads to split the two 403s. */
type LegacyThrow = { ok: false; status: 401 | 403; message: string };

/** LegacyOk is `verifyApiKeyAuth`'s success — every layer allowed. */
type LegacyOk = { ok: true };

/** LegacyOrgOutcome is the org gate's raw shape before the probe classifies it. */
type LegacyOrgOutcome =
  | { validKey: false }
  | { validKey: true; accessLevel: string; orgId?: string };

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  const captureSink = (span?: ParitySink["span"]) => {
    const calls: { stat: string; tags: Record<string, string | number> }[] = [];
    const sink: ParitySink = {
      increment: (stat, tags) => calls.push({ stat, tags }),
      span: span ?? (() => undefined),
    };
    return { calls, sink };
  };

  const fakeSpan = () => {
    const attrs: Record<string, string | number> = {};
    return {
      attrs,
      span: () => ({
        setAttribute: (key: string, value: string | number) => {
          attrs[key] = value;
        },
      }),
    };
  };

  describe("classifyMatrix — the shared confusion cells", () => {
    it.each([
      ["both allow", "allow", "allow", "tp"],
      ["both deny", "deny", "deny", "tn"],
      ["new allows what legacy denied", "deny", "allow", "fp"],
      ["new denies what legacy allowed", "allow", "deny", "fn"],
    ] as const)("%s", (_name, legacy, neu, cell) => {
      const { calls, sink } = captureSink();
      const result = recordParity(
        { layer: "authz", seam: "project_route", legacy, neu, action: "traces:read" },
        sink,
      );
      expect(result.cell).toBe(cell);
      expect(calls[0].tags.legacy_opinion).toBe("bearing");
    });

    it("an absent legacy takes an implicit-allow baseline, tagged absent", () => {
      const { calls, sink } = captureSink();
      const allow = recordParity(
        { layer: "authz", seam: "mcp_tool", legacy: "absent", neu: "allow", action: "prompts:read" },
        sink,
      );
      const deny = recordParity(
        { layer: "authz", seam: "mcp_tool", legacy: "absent", neu: "deny", action: "prompts:read" },
        sink,
      );
      expect(allow.cell).toBe("tp");
      expect(deny.cell).toBe("fn");
      expect(calls.every((c) => c.tags.legacy_opinion === "absent")).toBe(true);
    });
  });

  describe("classifyResolution — the allowlist, not a matrix", () => {
    it("agreement is expected", () => {
      expect(
        recordParity(
          { layer: "resolution", seam: "project_route", legacy: "allow", neu: "allow" },
          captureSink().sink,
        ).cell,
      ).toBe("expected");
    });
    it("an allowlisted LFE-15149 shift is expected", () => {
      expect(
        recordParity(
          {
            layer: "resolution",
            seam: "project_route",
            legacy: "allow",
            neu: "deny",
            resolutionShift: "outside_grant_404",
          },
          captureSink().sink,
        ).cell,
      ).toBe("expected");
    });
    it("an unsanctioned resolution divergence is unexpected", () => {
      expect(
        recordParity(
          { layer: "resolution", seam: "project_route", legacy: "allow", neu: "deny" },
          captureSink().sink,
        ).cell,
      ).toBe("unexpected");
    });
  });

  describe("newOpinions — the uniform error-keyed mapper", () => {
    const routeLayers = ["authn", "resolution", "authz"] as const;
    it("a success allows every evaluated layer", () => {
      expect(newOpinions({ success: true }, routeLayers)).toEqual({
        authn: "allow",
        resolution: "allow",
        authz: "allow",
      });
    });
    it("UnauthorizedError denies authn, leaves the rest absent", () => {
      const error = { name: "UnauthorizedError" } as BaseError;
      expect(newOpinions({ success: false, error }, routeLayers)).toEqual({
        authn: "deny",
        resolution: "absent",
        authz: "absent",
      });
    });
    it("InvalidRequestError allows authn, denies resolution, leaves authz absent", () => {
      const error = { name: "InvalidRequestError" } as BaseError;
      expect(newOpinions({ success: false, error }, routeLayers)).toEqual({
        authn: "allow",
        resolution: "deny",
        authz: "absent",
      });
    });
    it("ForbiddenError allows authn and resolution, denies authz", () => {
      const error = { name: "ForbiddenError" } as BaseError;
      expect(newOpinions({ success: false, error }, routeLayers)).toEqual({
        authn: "allow",
        resolution: "allow",
        authz: "deny",
      });
    });
  });

  describe("legacyProjectVerdict — the project chokepoint, 401/403/403", () => {
    it("401 is an authn deny", () => {
      expect(legacyProjectVerdict({ ok: false, status: 401, message: "x" })).toEqual({
        authn: "deny",
        resolution: "absent",
        authz: "absent",
      });
    });
    it("403 insufficient permissions is an authz deny", () => {
      expect(
        legacyProjectVerdict({
          ok: false,
          status: 403,
          message: "Access denied - insufficient permissions for this endpoint",
        }),
      ).toEqual({ authn: "allow", resolution: "allow", authz: "deny" });
    });
    it("403 project-id-not-found is a resolution deny", () => {
      expect(
        legacyProjectVerdict({
          ok: false,
          status: 403,
          message: "Project ID not found for API token. Are you using an organization key?",
        }),
      ).toEqual({ authn: "allow", resolution: "deny", authz: "absent" });
    });
    it("success allows every layer", () => {
      expect(legacyProjectVerdict({ ok: true })).toEqual({
        authn: "allow",
        resolution: "allow",
        authz: "allow",
      });
    });
  });

  describe("legacyOrgVerdict — the inlined org gate factored to a probe", () => {
    it("a bad credential is an authn deny", () => {
      expect(legacyOrgVerdict({ validKey: false })).toMatchObject({ authn: "deny" });
    });
    it("a non-org key is an authz deny", () => {
      expect(
        legacyOrgVerdict({ validKey: true, accessLevel: "project", orgId: undefined }),
      ).toMatchObject({ authn: "allow", authz: "deny" });
    });
    it("an org key with an org id allows", () => {
      expect(
        legacyOrgVerdict({ validKey: true, accessLevel: "organization", orgId: "org_1" }),
      ).toMatchObject({ authn: "allow", authz: "allow" });
    });
  });

  describe("reconstructLegacyIngestionAuthz — per-event, not the 207 overcount", () => {
    it("a project key allows every family", () => {
      expect(
        reconstructLegacyIngestionAuthz({
          accessLevel: "project",
          eventType: "trace-create",
          suspended: false,
        }),
      ).toBe("allow");
    });
    it("a scores key denies trace events, allows score events", () => {
      expect(
        reconstructLegacyIngestionAuthz({
          accessLevel: "scores",
          eventType: "trace-create",
          suspended: false,
        }),
      ).toBe("deny");
      expect(
        reconstructLegacyIngestionAuthz({
          accessLevel: "scores",
          eventType: "score-create",
          suspended: false,
        }),
      ).toBe("allow");
    });
    it("suspension denies the authz-bearing families", () => {
      expect(
        reconstructLegacyIngestionAuthz({
          accessLevel: "project",
          eventType: "score-create",
          suspended: true,
        }),
      ).toBe("deny");
    });
    it("sdk-log carries no authz opinion", () => {
      expect(
        reconstructLegacyIngestionAuthz({
          accessLevel: "project",
          eventType: "sdk-log",
          suspended: false,
        }),
      ).toBe("absent");
    });
  });

  describe("all four seams classify at one point", () => {
    it("project_route: legacy denies authz, new allows → authz fp", () => {
      const legacy = legacyProjectVerdict({
        ok: false,
        status: 403,
        message: "Access denied - insufficient permissions for this endpoint",
      });
      const neu = newOpinions({ success: true }, ["authn", "resolution", "authz"]);
      const { sink } = captureSink();
      expect(
        recordParity({ layer: "authn", seam: "project_route", legacy: legacy.authn, neu: neu.authn }, sink).cell,
      ).toBe("tp");
      expect(
        recordParity(
          { layer: "authz", seam: "project_route", legacy: legacy.authz, neu: neu.authz, action: "traces:read" },
          sink,
        ).cell,
      ).toBe("fp");
    });

    it("org_route: legacy allows authz, new denies → authz fn", () => {
      const legacy = legacyOrgVerdict({ validKey: true, accessLevel: "organization", orgId: "org_1" });
      const error = { name: "ForbiddenError" } as BaseError;
      const neu = newOpinions({ success: false, error }, ["authn", "authz"]);
      const { sink } = captureSink();
      expect(
        recordParity({ layer: "authn", seam: "org_route", legacy: legacy.authn, neu: neu.authn }, sink).cell,
      ).toBe("tp");
      expect(
        recordParity(
          { layer: "authz", seam: "org_route", legacy: legacy.authz, neu: neu.authz, action: "projects:read" },
          sink,
        ).cell,
      ).toBe("fn");
    });

    it("ingestion_event: reconstructed legacy vs new, cell by cell per event", () => {
      const events = [
        { type: "trace-create", accessLevel: "scores" as const, neu: "deny" as const, cell: "tn" },
        { type: "score-create", accessLevel: "scores" as const, neu: "allow" as const, cell: "tp" },
      ];
      const { calls, sink } = captureSink();
      for (const event of events) {
        const legacy = reconstructLegacyIngestionAuthz({
          accessLevel: event.accessLevel,
          eventType: event.type,
          suspended: false,
        });
        expect(
          recordParity(
            { layer: "authz", seam: "ingestion_event", legacy, neu: event.neu, action: "traces:create" },
            sink,
          ).cell,
        ).toBe(event.cell);
      }
      expect(calls).toHaveLength(2);
    });

    it("mcp_access connection: a suspended org, legacy and new agree on deny", () => {
      const legacy = legacyMcpConnectionVerdict({ validKey: true, accessLevel: "project", mcpSuspended: true });
      const error = { name: "ForbiddenError" } as BaseError;
      const neu = newOpinions({ success: false, error }, ["authn", "authz"]);
      const { sink } = captureSink();
      expect(
        recordParity({ layer: "authn", seam: "mcp_access", legacy: legacy.authn, neu: neu.authn }, sink).cell,
      ).toBe("tp");
      expect(
        recordParity(
          { layer: "authz", seam: "mcp_access", legacy: legacy.authz, neu: neu.authz, action: "mcp:access" },
          sink,
        ).cell,
      ).toBe("tn");
    });

    it("mcp_tool: legacy absent, new denies → fn tagged absent", () => {
      const legacy = legacyMcpToolVerdict();
      const error = { name: "ForbiddenError" } as BaseError;
      const neu = newOpinions({ success: false, error }, ["authz"]);
      const { calls, sink } = captureSink();
      const result = recordParity(
        { layer: "authz", seam: "mcp_tool", legacy, neu: neu.authz, action: "prompts:read" },
        sink,
      );
      expect(result.cell).toBe("fn");
      expect(calls[0].tags.legacy_opinion).toBe("absent");
    });
  });

  describe("refutation probes — where the contract's clean surfacing frays", () => {
    it("mcp_tool cannot stamp an http.server span; the counter still lands", () => {
      const { calls, sink } = captureSink(() => undefined);
      const result = recordParity(
        { layer: "authz", seam: "mcp_tool", legacy: "absent", neu: "deny", action: "prompts:read" },
        sink,
      );
      expect(result.stamped).toBe(false);
      expect(calls).toHaveLength(1);
    });
    it("an http seam stamps the full payload onto its span", () => {
      const { attrs, span } = fakeSpan();
      const { sink } = captureSink(span);
      const result = recordParity(
        { layer: "authz", seam: "project_route", legacy: "deny", neu: "allow", action: "traces:read" },
        sink,
      );
      expect(result.stamped).toBe(true);
      expect(attrs[`${parityStat}.cell`]).toBe("fp");
      expect(attrs[`${parityStat}.legacy_opinion`]).toBe("bearing");
    });
    it("the project probe leans on a message string, the one place legacy isn't a typed value", () => {
      const reworded = legacyProjectVerdict({ ok: false, status: 403, message: "forbidden" });
      expect(reworded.authz).toBe("deny");
    });
  });

  describe("recordCoverage — exhaustive, one increment per request", () => {
    it("increments once tagged by operation", () => {
      const { calls, sink } = captureSink();
      recordCoverage("GET /api/public/v2/prompts/{name}", sink);
      expect(calls).toEqual([
        { stat: coverageStat, tags: { operation: "GET /api/public/v2/prompts/{name}" } },
      ]);
    });
  });
}
