import {
  getCurrentSpan,
  logger,
  recordIncrement,
  type ApiAccessLevel,
} from "@langfuse/shared/src/server";

/** parityStat counts non-matching authorization decisions. */
const parityStat = "langfuse.authz.parity";

/** defaultTelemetry writes to dogstatsd and the active span; tests inject a capturing fake. */
const defaultTelemetry: Telemetry = {
  increment: (stat, tags) => recordIncrement(stat, 1, tags),
  span: () => getCurrentSpan(),
};

/** shadowAuthDiff records non-matching parity and logs every mismatch independently of trace sampling. */
export function shadowAuthDiff(
  newDecision: NewDecision,
  legacyDecision: LegacyDecision,
  action: string,
  metadata: AuthDiffMetadata,
  telemetry: Telemetry = defaultTelemetry,
): ParityResult {
  const n = newVerdict(newDecision);
  const l = legacyVerdict(legacyDecision);
  const result = classify(l.verdict, n.verdict);
  if (result === "match") return result;

  const tags = {
    action,
    access_level: l.accessLevel,
    result,
    legacy_code: l.code,
    new_code: n.code,
  };
  emitAuthDiff(tags, metadata, telemetry);
  return result;
}

/** emitAuthDiff writes the mismatch to logs, metrics, and the active span. */
function emitAuthDiff(
  tags: Record<string, string | number>,
  metadata: AuthDiffMetadata,
  telemetry: Telemetry,
): void {
  logger.info("Public API authorization mismatch", {
    event: "authz_parity",
    ...tags,
    api_key_id: metadata.apiKeyId,
    public_key: metadata.publicKey,
    resource: metadata.resource,
  });
  telemetry.increment(parityStat, { ...tags, resource: metadata.resource });
  const span = telemetry.span();
  if (!span) return;
  for (const [key, value] of Object.entries(tags)) {
    span.setAttribute(`${parityStat}.${key}`, value);
  }
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
  return decision.success
    ? { verdict: "allow", code: 200, accessLevel: decision.scope.accessLevel }
    : {
        verdict: "deny",
        code: decision.error.httpCode,
        accessLevel: "unknown",
      };
}

/** classify names agreement as `match`, otherwise which path is stricter. */
function classify(legacyVerdict: Verdict, newVerdict: Verdict): ParityResult {
  if (legacyVerdict === newVerdict) return "match";
  return newVerdict === "deny" ? "new_denies" : "new_allows";
}

/** Verdict is one path's decision at one enforcement point. */
type Verdict = "allow" | "deny";

/** AuthDiffMetadata carries safe key identity and the resolved HTTP route resource. */
type AuthDiffMetadata = {
  apiKeyId?: string;
  publicKey?: string;
  resource: string;
};

/** ParityResult is the signal: agreement or which path is stricter. */
export type ParityResult = "match" | "new_denies" | "new_allows";

/** LegacyDecision is the legacy path's outcome: it allowed with a resolved scope or denied with a typed error. */
export type LegacyDecision =
  | { success: true; scope: { accessLevel: ApiAccessLevel } }
  | { success: false; error: { httpCode: number } };

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
