/// <reference types="vitest/importMeta" />
/**
 * PROTOTYPE — THROWAWAY, does not merge (branch `prototype/parity-classification`,
 * LFE-15559). The one signal that answers "can we flip PUBLIC_API_AUTHZ_MIGRATION
 * to enforce in this region?": at every authorization decision, does the NEW
 * verdict match what LEGACY decided? Emitted as one counter, read by the Datadog
 * queries below, and wired into all four seams (see enforcement.*.prototype.ts,
 * define-tool.prototype.ts). Run: `pnpm --filter web run test:in-source shadow.prototype`.
 *
 * ── Datadog · the ship gate ────────────────────────────────────────────────
 * Every disagreement between the two paths, last 7d, grouped so each row is one
 * kind of divergence. This MUST be empty — bar rows you recognise as expected —
 * before flipping a region to enforce:
 *
 *   sum:langfuse.authz.parity{result:new_denies OR result:new_allows}.as_count()
 *     by {seam,action,legacy_code,new_code}
 *
 *   • new_denies — new path 4xxs a request legacy allows → BREAKAGE (users feel it).
 *   • new_allows — new path allows a request legacy blocks → SECURITY HOLE.
 *
 * The known-expected rows to exclude by eye (not in code — a human reads them):
 *   • resolution shifts (LFE-15149): seam:project_route|org_route, legacy_code:403,
 *     new_code:400 — a disagreeing/absent target now 400s instead of 403.
 *   • net-new MCP per-tool enforcement lands under result:net_new, never here.
 *
 * ── Datadog · is a zero real, or just no traffic? ──────────────────────────
 *   sum:langfuse.authz.coverage{*}.as_count() by {operation}
 * An operation sitting at 0 is a dead route in the sample, not proof of parity.
 * ───────────────────────────────────────────────────────────────────────────
 */

import {
  getCurrentSpan,
  recordIncrement,
  type AuthHeaderVerificationResult,
} from "@langfuse/shared/src/server";

/** parityStat counts one authorization decision; coverageStat counts one request. */
const parityStat = "langfuse.authz.parity";
const coverageStat = "langfuse.authz.coverage";

/** defaultSink writes to dogstatsd and the active span; tests inject a capturing fake. */
const defaultSink: ParitySink = {
  increment: (stat, tags) => recordIncrement(stat, 1, tags),
  span: () => getCurrentSpan(),
};

/** diffResults classifies the new pipeline's decision against the legacy one and emits `langfuse.authz.parity`; returns the result so callers and tests can assert it. */
export function diffResults(
  neu: NewResult,
  legacy: LegacyDecision,
  meta: { seam: Seam; action: string },
  sink: ParitySink = defaultSink,
): ParityResult {
  const n = newVerdict(neu);
  const l = legacyVerdict(legacy);
  const result = classify(l.verdict, n.verdict);
  const tags = {
    seam: meta.seam,
    action: meta.action,
    result,
    legacy_code: l.code,
    new_code: n.code,
  } satisfies Record<string, string | number>;
  sink.increment(parityStat, tags);
  sink.span()?.setAttribute(`${parityStat}.result`, result);
  return result;
}

/** recordCoverage counts a request against its operation so the ship gate's zeros can be told apart from untested routes. */
export function recordCoverage(
  operation: string,
  sink: ParitySink = defaultSink,
): void {
  sink.increment(coverageStat, { operation });
}

/** newVerdict reads the new pipeline's result — the whole `new → verdict` mapper: success allows (200), any error denies with its http code (401 authn, 400 resolution, 403 authz). */
export function newVerdict(result: NewResult): { verdict: Verdict; code: number } {
  return result.success
    ? { verdict: "allow", code: 200 }
    : { verdict: "deny", code: result.error.httpCode };
}

/** verdictFromStatus reads a legacy chokepoint's http status: under 400 allows, else denies. */
export function verdictFromStatus(status: number): Verdict {
  return status < 400 ? "allow" : "deny";
}

/** legacyFromStatus lifts a legacy chokepoint's http status into a LegacyDecision for diffResults. */
export function legacyFromStatus(status: number): LegacyDecision {
  return status < 400 ? { ok: true } : { ok: false, code: status };
}

/** legacyFromVerdict lifts a per-decision legacy verdict (a reconstruction, or `absent` where legacy ran no gate) into a LegacyDecision. */
export function legacyFromVerdict(verdict: Verdict): LegacyDecision {
  if (verdict === "absent") return { absent: true };
  return verdict === "allow" ? { ok: true } : { ok: false, code: 403 };
}

/** newFromVerdict lifts a per-decision new verdict into a NewResult for diffResults. */
export function newFromVerdict(verdict: Exclude<Verdict, "absent">): NewResult {
  return verdict === "allow" ? { success: true } : { success: false, error: { httpCode: 403 } };
}

/** legacyVerdict reads a legacy decision into a verdict + code: `absent` where it ran no gate, else allow/deny by its status. */
function legacyVerdict(legacy: LegacyDecision): { verdict: Verdict; code: number } {
  if ("absent" in legacy) return { verdict: "absent", code: 0 };
  const code = legacy.ok ? 200 : legacy.code;
  return { verdict: verdictFromStatus(code), code };
}

/** classify names the disagreement: legacy without a gate is `net_new`, agreement is `match`, else which path is stricter. */
function classify(legacy: Verdict, neu: Verdict): ParityResult {
  if (legacy === "absent") return "net_new";
  if (legacy === neu) return "match";
  return neu === "deny" ? "new_denies" : "new_allows";
}

/** Verdict is one path's decision at one enforcement point; legacy is `absent` only where it runs no gate (MCP per-tool). */
export type Verdict = "allow" | "deny" | "absent";

/** ParityResult is the signal: agreement, which path is stricter, or net-new enforcement legacy never gated. */
export type ParityResult = "match" | "new_denies" | "new_allows" | "net_new";

/** Seam is the enforcement point a decision came from. */
export type Seam =
  | "project_route"
  | "org_route"
  | "ingestion_event"
  | "mcp_access"
  | "mcp_tool";

/** LegacyDecision is the legacy path's outcome as diffResults reads it: it allowed, it denied with an http code, or it ran no gate (`absent`). */
export type LegacyDecision =
  | { ok: true }
  | { ok: false; code: number }
  | { absent: true };

/** LegacyAuthDecision is a seam's legacy verify captured as a value — the verified auth on success, or the status plus the error to re-throw on failure. `status` rides both branches so diffResults can read it uniformly. */
export type LegacyAuthDecision<TAuth> =
  | { ok: true; status: number; auth: TAuth }
  | { ok: false; status: number; error: unknown };

/** ParitySink is the telemetry surface, injectable so tests capture without a collector. */
export type ParitySink = {
  increment: (stat: string, tags: Record<string, string | number>) => void;
  span: () =>
    | { setAttribute: (key: string, value: string | number) => void }
    | undefined;
};

/** NewResult is the new pipeline's outcome at a decision point — a success or a typed error carrying its http code. */
export type NewResult =
  | { success: true }
  | { success: false; error: { httpCode: number } };

/** AuthorizeSeamResult is a seam method's return: legacy's verify result and the new pipeline's outcome, both as values so the chokepoint proceeds without re-verifying. */
export type AuthorizeSeamResult<TAuthz> = {
  authCheck: AuthHeaderVerificationResult;
  authz: TAuthz;
};

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  const capture = () => {
    const calls: { stat: string; tags: Record<string, string | number> }[] = [];
    const sink: ParitySink = {
      increment: (stat, tags) => calls.push({ stat, tags }),
      span: () => undefined,
    };
    return { calls, sink };
  };

  const deny: NewResult = { success: false, error: { httpCode: 403 } };
  const allow: NewResult = { success: true };

  describe("diffResults — the ship-gate signal", () => {
    it.each([
      ["both allow → match", allow, { ok: true } as LegacyDecision, "match"],
      ["both deny → match", deny, { ok: false, code: 403 } as LegacyDecision, "match"],
      ["new denies what legacy allows → new_denies (breakage)", deny, { ok: true } as LegacyDecision, "new_denies"],
      ["new allows what legacy denies → new_allows (security)", allow, { ok: false, code: 403 } as LegacyDecision, "new_allows"],
      ["legacy has no gate → net_new", deny, { absent: true } as LegacyDecision, "net_new"],
    ] as const)("%s", (_name, neu, legacy, result) => {
      const { calls, sink } = capture();
      expect(
        diffResults(neu, legacy, { seam: "project_route", action: "traces:read" }, sink),
      ).toBe(result);
      expect(calls[0].tags.result).toBe(result);
    });
  });

  describe("recordCoverage", () => {
    it("counts a request against its operation", () => {
      const { calls, sink } = capture();
      recordCoverage("GET /api/public/v2/prompts", sink);
      expect(calls).toEqual([
        { stat: coverageStat, tags: { operation: "GET /api/public/v2/prompts" } },
      ]);
    });
  });
}
