import {
  getCurrentSpan,
  recordIncrement,
  type ApiAccessLevel,
} from "@langfuse/shared/src/server";

/** parityStat counts one authorization decision. */
const parityStat = "langfuse.authz.parity";

/** defaultTelemetry writes to dogstatsd and the active span; tests inject a capturing fake. */
const defaultTelemetry: Telemetry = {
  increment: (stat, tags) => recordIncrement(stat, 1, tags),
  span: () => getCurrentSpan(),
};

/** shadowAuthDiff classifies the new pipeline's decision against legacy's, emits `langfuse.authz.parity`, and returns the result. */
export function shadowAuthDiff(
  newDecision: NewDecision,
  legacyDecision: LegacyDecision,
  action: string,
  telemetry: Telemetry = defaultTelemetry,
): ParityResult {
  const n = newVerdict(newDecision);
  const l = legacyVerdict(legacyDecision);
  const result = classify(l.verdict, n.verdict);
  telemetry.increment(parityStat, {
    action,
    access_level: l.accessLevel,
    result,
    legacy_code: l.code,
    new_code: n.code,
  });
  telemetry.span()?.setAttribute(`${parityStat}.result`, result);
  return result;
}

/** newVerdict reads the new decision: success allows (200), else denies with its http code. */
function newVerdict(decision: NewDecision): { verdict: Verdict; code: number } {
  return decision.success
    ? { verdict: "allow", code: 200 }
    : { verdict: "deny", code: decision.error.httpCode };
}

/** legacyVerdict reads a legacy decision into a verdict, code, and the access level it resolved. */
function legacyVerdict(decision: LegacyDecision): {
  verdict: Verdict;
  code: number;
  accessLevel: string;
} {
  if ("absent" in decision)
    return { verdict: "absent", code: 0, accessLevel: "unknown" };
  return decision.success
    ? { verdict: "allow", code: 200, accessLevel: decision.scope.accessLevel }
    : { verdict: "deny", code: decision.status, accessLevel: "unknown" };
}

/** classify names the disagreement: legacy without a gate is `net_new`, agreement is `match`, else which path is stricter. */
function classify(legacy: Verdict, neu: Verdict): ParityResult {
  if (legacy === "absent") return "net_new";
  if (legacy === neu) return "match";
  return neu === "deny" ? "new_denies" : "new_allows";
}

/** Verdict is one path's decision at one enforcement point; legacy is `absent` only where it runs no gate. */
type Verdict = "allow" | "deny" | "absent";

/** ParityResult is the signal: agreement, which path is stricter, or net-new enforcement legacy never gated. */
export type ParityResult = "match" | "new_denies" | "new_allows" | "net_new";

/** LegacyDecision is the legacy path's outcome: it allowed with a resolved scope, denied with an http status, or ran no gate. */
export type LegacyDecision =
  | { success: true; scope: { accessLevel: ApiAccessLevel } }
  | { success: false; status: number }
  | { absent: true };

/** Telemetry is the emit surface, injectable so tests capture without a collector. */
export type Telemetry = {
  increment: (stat: string, tags: Record<string, string | number>) => void;
  span: () =>
    | { setAttribute: (key: string, value: string | number) => void }
    | undefined;
};

/** NewDecision is the new pipeline's outcome at a decision point: a success or a typed error carrying its http code. */
export type NewDecision =
  | { success: true }
  | { success: false; error: { httpCode: number } };

export const __test = { newVerdict, legacyVerdict };
