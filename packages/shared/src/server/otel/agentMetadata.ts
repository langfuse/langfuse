import { AGENT_LIMITS } from "../../features/agents/api";

export type AgentIdentity = {
  id?: string;
  name?: string;
  runId?: string;
  source?: Source;
};

type Source = "native" | "gen-ai" | "span-name";
type Attribute = { value: string; source: Source };

const firstString = (
  attributes: Record<string, unknown>,
  nativeKey: string,
  standardKey: string,
): Attribute | undefined => {
  for (const [key, source] of [
    [nativeKey, "native"],
    [standardKey, "gen-ai"],
  ] as const) {
    const value = attributes[key];
    if (typeof value === "string" && value.trim().length > 0)
      return { value, source };
  }
  return undefined;
};

const within = (value: string, limit: number) =>
  value.length <= limit * 2 && Array.from(value).length <= limit;

/** Exact observation-level identity; run references are scoped to its trace. */
export const extractAgentIdentity = ({
  attributes,
  isAgent,
  name,
  spanId,
}: {
  attributes: Record<string, unknown>;
  isAgent: boolean;
  name: string;
  spanId: string;
}): AgentIdentity => {
  const id = firstString(attributes, "langfuse.agent.id", "gen_ai.agent.id");
  if (id && !within(id.value, AGENT_LIMITS.idLength)) return {};
  const explicitName = firstString(
    attributes,
    "langfuse.agent.name",
    "gen_ai.agent.name",
  );
  const selectedName =
    explicitName ??
    (isAgent && name.trim().length > 0
      ? { value: name, source: "span-name" as const }
      : undefined);
  const validName =
    selectedName && within(selectedName.value, AGENT_LIMITS.nameLength)
      ? selectedName
      : undefined;
  const identity = id ?? validName;
  if (!identity) return {};
  const explicitRun = attributes["langfuse.agent.run_id"];
  let runId: string | undefined;
  if (isAgent && attributes["gen_ai.operation.name"] !== "create_agent")
    runId = spanId;
  else if (
    !isAgent &&
    typeof explicitRun === "string" &&
    explicitRun !== spanId &&
    explicitRun.trim().length > 0 &&
    within(explicitRun, AGENT_LIMITS.runIdLength)
  )
    runId = explicitRun;
  return {
    ...(id ? { id: id.value } : {}),
    ...(validName ? { name: validName.value } : {}),
    ...(runId ? { runId: runId } : {}),
    source: identity.source,
  };
};

export type AgentSpan = {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  isAgent: boolean;
  attributes: Record<string, unknown>;
};

export const agentSpanKey = (traceId: string, spanId: string) =>
  JSON.stringify([traceId, spanId]);

/** Presence distinguishes missing context from explicitly invalid instrumentation. */
export const hasAgentIdentityContext = (
  span: Pick<AgentSpan, "isAgent" | "attributes">,
) =>
  span.isAgent ||
  [
    "langfuse.agent.id",
    "gen_ai.agent.id",
    "langfuse.agent.name",
    "gen_ai.agent.name",
    "langfuse.agent.run_id",
  ].some((key) => Object.hasOwn(span.attributes, key));

/** Resolve only this batch; absent parents stay unattributed across batches. */
export const resolveAgentBatchIdentity = (spans: AgentSpan[]) => {
  const nodes = new Map(
    spans.map((span) => [agentSpanKey(span.traceId, span.spanId), span]),
  );
  const identities = new Map<string, AgentIdentity | null>(
    spans.map((span) => [
      agentSpanKey(span.traceId, span.spanId),
      hasAgentIdentityContext(span) ? extractAgentIdentity(span) : null,
    ]),
  );
  for (const span of spans) {
    if (span.isAgent) continue;
    const key = agentSpanKey(span.traceId, span.spanId);
    const own = identities.get(key) ?? {};
    const explicitId = firstString(
      span.attributes,
      "langfuse.agent.id",
      "gen_ai.agent.id",
    );
    if (explicitId && !within(explicitId.value, AGENT_LIMITS.idLength))
      continue;
    const explicitName = firstString(
      span.attributes,
      "langfuse.agent.name",
      "gen_ai.agent.name",
    );
    const hasExplicitIdentity = [
      "langfuse.agent.id",
      "gen_ai.agent.id",
      "langfuse.agent.name",
      "gen_ai.agent.name",
    ].some((attribute) => Object.hasOwn(span.attributes, attribute));
    if (hasExplicitIdentity && !explicitId && !explicitName) continue;
    const invalidName =
      explicitName && !within(explicitName.value, AGENT_LIMITS.nameLength);
    if (invalidName && !explicitId) continue;
    const explicitRun = span.attributes["langfuse.agent.run_id"];
    if (explicitRun === span.spanId) {
      delete own.runId;
      continue;
    }
    let parent =
      typeof explicitRun === "string" && explicitRun.trim()
        ? explicitRun
        : span.parentSpanId;
    const seen = new Set([span.spanId]);
    while (parent && !seen.has(parent) && seen.size <= 128) {
      seen.add(parent);
      const ancestor = nodes.get(agentSpanKey(span.traceId, parent));
      if (!ancestor) break;
      if (ancestor.isAgent) {
        const inherited =
          identities.get(agentSpanKey(ancestor.traceId, ancestor.spanId)) ?? {};
        let idMatches = true;
        if (own.id) idMatches = own.id === inherited.id;
        else if (own.name) idMatches = own.name === inherited.name;
        if (idMatches) {
          const merged: AgentIdentity = {
            ...inherited,
            ...own,
            ...(!own.id && inherited.id
              ? {
                  source: inherited.source,
                }
              : {}),
          };
          if (invalidName) delete merged.name;
          if (ancestor.attributes["gen_ai.operation.name"] === "create_agent")
            delete merged.runId;
          identities.set(key, merged);
        } else delete own.runId;
        break;
      }
      if (explicitRun) {
        delete own.runId;
        break;
      }
      parent = ancestor.parentSpanId;
    }
  }
  return identities;
};

/** Reconcile explicit attributes with dedicated identity retained across updates. */
export const normalizeAgentIdentity = ({
  identity = {},
  attributes: incomingAttributes,
  isAgent,
  name,
  spanId,
}: Parameters<typeof extractAgentIdentity>[0] & {
  identity?: AgentIdentity;
}): AgentIdentity => {
  const attributes = { ...incomingAttributes };
  const operation = incomingAttributes["gen_ai.operation.name"];
  const hasIncomingOperation =
    typeof operation === "string" && operation.trim().length > 0;
  for (const [key, native, standard] of [
    ["id", "langfuse.agent.id", "gen_ai.agent.id"],
    ["name", "langfuse.agent.name", "gen_ai.agent.name"],
    ["runId", "langfuse.agent.run_id", "langfuse.agent.run_id"],
  ] as const) {
    if (key === "name" && isAgent && identity.source === "span-name") continue;
    if (attributes[native] === undefined && attributes[standard] === undefined)
      attributes[native] = identity[key];
  }
  const normalized = extractAgentIdentity({
    attributes,
    isAgent,
    name,
    spanId,
  });
  const identityKey = normalized.id ? "id" : "name";
  const sameIdentity =
    normalized[identityKey] &&
    normalized[identityKey] === identity[identityKey];
  if (
    sameIdentity &&
    (identity.source === "native" ||
      identity.source === "gen-ai" ||
      identity.source === "span-name")
  )
    normalized.source = identity.source;
  // Configuration spans have identity but no execution owner.
  if (
    isAgent &&
    identity.source &&
    (identity.id || identity.name) &&
    !identity.runId &&
    !hasIncomingOperation
  )
    delete normalized.runId;
  // An inherited owner cannot survive an explicit change of logical agent.
  if (
    !isAgent &&
    (identity.id || identity.name) &&
    !sameIdentity &&
    incomingAttributes["langfuse.agent.run_id"] === undefined
  )
    delete normalized.runId;
  return normalized;
};
