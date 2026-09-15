import { getCurrentSpan, recordIncrement } from "@langfuse/shared/src/server";

/** parityStat counts one authorization decision. */
const parityStat = "langfuse.authz.parity";

/** coverageStat counts one request against its operation. */
const coverageStat = "langfuse.authz.coverage";

/** defaultSink writes to dogstatsd and the active span; tests inject a capturing fake. */
const defaultSink: ParitySink = {
  increment: (stat, tags) => recordIncrement(stat, 1, tags),
  span: () => getCurrentSpan(),
};

/** diffResults classifies the new pipeline's decision against legacy's, emits `langfuse.authz.parity`, and returns the result. */
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

/** recordCoverage counts a request against its operation so parity zeros can be told from untested routes. */
export function recordCoverage(
  operation: string,
  sink: ParitySink = defaultSink,
): void {
  sink.increment(coverageStat, { operation });
}

/** newVerdict reads the new pipeline's result: success allows (200), else denies with its http code. */
export function newVerdict(result: NewResult): {
  verdict: Verdict;
  code: number;
} {
  return result.success
    ? { verdict: "allow", code: 200 }
    : { verdict: "deny", code: result.error.httpCode };
}

/** verdictFromStatus reads a legacy chokepoint's http status: under 400 allows, else denies. */
function verdictFromStatus(status: number): Verdict {
  return status < 400 ? "allow" : "deny";
}

/** legacyFromStatus lifts a legacy chokepoint's http status into a LegacyDecision. */
export function legacyFromStatus(status: number): LegacyDecision {
  return status < 400 ? { ok: true } : { ok: false, code: status };
}

/** legacyVerdict reads a legacy decision into a verdict + code. */
function legacyVerdict(legacy: LegacyDecision): {
  verdict: Verdict;
  code: number;
} {
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

/** Verdict is one path's decision at one enforcement point; legacy is `absent` only where it runs no gate. */
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

/** LegacyDecision is the legacy path's outcome: it allowed, it denied with an http code, or it ran no gate. */
export type LegacyDecision =
  | { ok: true }
  | { ok: false; code: number }
  | { absent: true };

/** ParitySink is the telemetry surface, injectable so tests capture without a collector. */
export type ParitySink = {
  increment: (stat: string, tags: Record<string, string | number>) => void;
  span: () =>
    | { setAttribute: (key: string, value: string | number) => void }
    | undefined;
};

/** NewResult is the new pipeline's outcome at a decision point: a success or a typed error carrying its http code. */
export type NewResult =
  | { success: true }
  | { success: false; error: { httpCode: number } };
