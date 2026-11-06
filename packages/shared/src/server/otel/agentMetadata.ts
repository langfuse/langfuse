import { AGENT_LIMITS, AGENT_METADATA_KEYS } from "../../features/agents/api";

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
export const extractAgentMetadata = ({
  attributes,
  isAgent,
  name,
  spanId,
}: {
  attributes: Record<string, unknown>;
  isAgent: boolean;
  name: string;
  spanId: string;
}): Record<string, string> => {
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
    ...(id ? { [AGENT_METADATA_KEYS.id]: id.value } : {}),
    ...(validName ? { [AGENT_METADATA_KEYS.name]: validName.value } : {}),
    ...(runId ? { [AGENT_METADATA_KEYS.runId]: runId } : {}),
    [AGENT_METADATA_KEYS.source]: identity.source,
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

/** Resolve only this batch; absent parents stay unattributed across batches. */
export const resolveAgentBatchMetadata = (spans: AgentSpan[]) => {
  const nodes = new Map(
    spans.map((span) => [agentSpanKey(span.traceId, span.spanId), span]),
  );
  const metadata = new Map(
    spans.map((span) => [
      agentSpanKey(span.traceId, span.spanId),
      extractAgentMetadata(span),
    ]),
  );
  for (const span of spans) {
    if (span.isAgent) continue;
    const key = agentSpanKey(span.traceId, span.spanId);
    const own = metadata.get(key)!;
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
    const invalidName =
      explicitName && !within(explicitName.value, AGENT_LIMITS.nameLength);
    if (invalidName && !explicitId) continue;
    const explicitRun = span.attributes["langfuse.agent.run_id"];
    if (explicitRun === span.spanId) {
      delete own[AGENT_METADATA_KEYS.runId];
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
        const inherited = metadata.get(
          agentSpanKey(ancestor.traceId, ancestor.spanId),
        )!;
        let idMatches = true;
        if (own[AGENT_METADATA_KEYS.id])
          idMatches =
            own[AGENT_METADATA_KEYS.id] === inherited[AGENT_METADATA_KEYS.id];
        else if (own[AGENT_METADATA_KEYS.name])
          idMatches =
            own[AGENT_METADATA_KEYS.name] ===
            inherited[AGENT_METADATA_KEYS.name];
        if (idMatches) {
          const merged: Record<string, string> = {
            ...inherited,
            ...own,
            ...(!own[AGENT_METADATA_KEYS.id] &&
            inherited[AGENT_METADATA_KEYS.id]
              ? {
                  [AGENT_METADATA_KEYS.source]:
                    inherited[AGENT_METADATA_KEYS.source],
                }
              : {}),
          };
          if (invalidName) delete merged[AGENT_METADATA_KEYS.name];
          if (ancestor.attributes["gen_ai.operation.name"] === "create_agent")
            delete merged[AGENT_METADATA_KEYS.runId];
          metadata.set(key, merged);
        } else delete own[AGENT_METADATA_KEYS.runId];
        break;
      }
      if (explicitRun) {
        delete own[AGENT_METADATA_KEYS.runId];
        break;
      }
      parent = ancestor.parentSpanId;
    }
  }
  return metadata;
};

/** Validate observation identity while preserving already normalized attribution frames. */
export const normalizeAgentObservationMetadata = ({
  metadata: originalMetadata,
  attributes: incomingAttributes,
  isAgent,
  name,
  spanId,
}: Parameters<typeof extractAgentMetadata>[0] & {
  metadata: Record<string, unknown>;
}): Record<string, unknown> => {
  const metadata = { ...originalMetadata };
  const attributes: Record<string, unknown> = {
    "gen_ai.operation.name": metadata["gen_ai.operation.name"],
    ...incomingAttributes,
  };
  const operation = incomingAttributes["gen_ai.operation.name"];
  const hasIncomingOperation =
    typeof operation === "string" && operation.trim().length > 0;
  for (const [reserved, native, standard] of [
    [AGENT_METADATA_KEYS.id, "langfuse.agent.id", "gen_ai.agent.id"],
    [AGENT_METADATA_KEYS.name, "langfuse.agent.name", "gen_ai.agent.name"],
    [
      AGENT_METADATA_KEYS.runId,
      "langfuse.agent.run_id",
      "langfuse.agent.run_id",
    ],
  ]) {
    // A span-name identity follows a renamed observation rather than becoming explicit.
    if (
      reserved === AGENT_METADATA_KEYS.name &&
      isAgent &&
      metadata[AGENT_METADATA_KEYS.source] === "span-name"
    )
      continue;
    if (attributes[native] === undefined && attributes[standard] === undefined)
      attributes[native] = metadata[reserved];
  }
  const agentMetadata = extractAgentMetadata({
    attributes,
    isAgent,
    name,
    spanId,
  });
  const source = metadata[AGENT_METADATA_KEYS.source];
  const isNormalizedSource =
    source === "native" || source === "gen-ai" || source === "span-name";
  const hasNormalizedIdentity = [
    AGENT_METADATA_KEYS.id,
    AGENT_METADATA_KEYS.name,
  ].some(
    (key) =>
      typeof metadata[key] === "string" && metadata[key].trim().length > 0,
  );
  // Canonical frames without an owner describe configuration rather than an agent run.
  if (
    isAgent &&
    isNormalizedSource &&
    hasNormalizedIdentity &&
    (metadata[AGENT_METADATA_KEYS.runId] === undefined ||
      metadata[AGENT_METADATA_KEYS.runId] === "") &&
    !hasIncomingOperation
  )
    delete agentMetadata[AGENT_METADATA_KEYS.runId];
  const identityKey = agentMetadata[AGENT_METADATA_KEYS.id]
    ? AGENT_METADATA_KEYS.id
    : AGENT_METADATA_KEYS.name;
  if (
    agentMetadata[identityKey] &&
    agentMetadata[identityKey] === metadata[identityKey] &&
    isNormalizedSource
  )
    agentMetadata[AGENT_METADATA_KEYS.source] = source;
  for (const key of Object.values(AGENT_METADATA_KEYS)) delete metadata[key];
  return { ...metadata, ...agentMetadata };
};
