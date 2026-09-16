import { createHash } from "node:crypto";
import {
  normalizeSpanIO,
  type NormalizedMessage,
  type NormalizedMessagePart,
} from "../../utils/normalized-io";

export type TopicsObservation = {
  id: string;
  projectId: string;
  traceId: string;
  parentObservationId: string | null;
  type: string;
  name: string;
  startTime: string;
  endTime: string | null;
  eventTimestamp: string;
  level: string;
  statusMessage: string | null;
  input: unknown;
  output: unknown;
  metadata: unknown;
};

type BlockSourceReference = {
  blockId: string;
  observationId: string;
  source: "input" | "output" | "status" | "structure";
  messageIndex?: number;
  partIndex?: number;
};

type TranscriptBlock = BlockSourceReference & {
  parentObservationId: string | null;
  role?: string;
  kind: string;
  text: string;
};

type TranscriptCoverage = {
  observationCount: number;
  missingParentIds: string[];
  cycleObservationIds: string[];
  unfinishedObservationCount: number;
  overlappingSiblingPairs: number;
  mediaPartCount: number;
  truncatedBlockCount: number;
  omittedBlockCount: number;
};

export type PreparedTrace = {
  projectId: string;
  traceId: string;
  sourceSnapshotHash: string;
  assemblerVersion: "1";
  blocks: TranscriptBlock[];
  coverage: TranscriptCoverage;
};

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const canonical = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => compare(a, b))
        .map(([key, nested]) => [key, canonical(nested)]),
    );
  }
  return value ?? null;
};
const serialize = (value: unknown): string => JSON.stringify(canonical(value));
const hash = (value: unknown) =>
  createHash("sha256").update(serialize(value)).digest("hex");

export const hashTraceSnapshot = (observations: readonly TopicsObservation[]) =>
  hash([...observations].sort((a, b) => compare(a.id, b.id)));

const boundText = (text: string, limit: number): string => {
  if (text.length <= limit) return text;
  const marker = " …[content omitted]… ";
  const remaining = Math.max(0, limit - marker.length);
  return (
    text.slice(0, Math.ceil(remaining * 0.7)) +
    marker +
    text.slice(text.length - Math.floor(remaining * 0.3))
  );
};

const redactInlineMedia = (text: string): string =>
  text.replace(
    /data:[^;,\s]+;base64,[A-Za-z0-9+/=_-]+/g,
    "[media payload omitted]",
  );

const modelData = (value: unknown, field?: string): unknown => {
  if (typeof value === "string") return redactInlineMedia(value);
  if (Array.isArray(value)) return value.map((item) => modelData(item, field));
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (
      ["reasoning", "thinking", "redacted_thinking"].includes(
        String(record.type),
      ) ||
      record.thought === true
    )
      return "[reasoning omitted]";
    return Object.fromEntries(
      Object.entries(record).map(([key, nested]) => [
        key,
        ["reasoning", "reasoning_content", "thinking"].includes(key)
          ? "[reasoning omitted]"
          : ["signature", "thoughtSignature", "encrypted_content"].includes(
                key,
              ) ||
              (key === "data" &&
                (record.type === "base64" ||
                  typeof record.mimeType === "string" ||
                  typeof record.mime_type === "string" ||
                  field === "audio" ||
                  field === "input_audio"))
            ? "[opaque payload omitted]"
            : modelData(nested, key),
      ]),
    );
  }
  return value;
};

const dataText = (value: unknown): string => serialize(modelData(value));

const partText = (part: NormalizedMessagePart): string => {
  switch (part.type) {
    case "text":
      return redactInlineMedia(part.text);
    case "reasoning":
      return "[reasoning omitted]";
    case "file":
      return (
        `[${part.mediaType ?? "file"}: content not inspected]` +
        (typeof part.providerMetadata?.transcript === "string"
          ? ` Existing transcript: ${redactInlineMedia(part.providerMetadata.transcript)}`
          : "")
      );
    case "tool-call":
      return `Tool call ${part.toolName} (${part.toolCallId ?? "ID missing"}): ${dataText(part.input)}`;
    case "tool-result":
      return `Tool result ${part.toolName ?? ""} (${part.toolCallId ?? "ID missing"})${part.isError ? " ERROR" : ""}: ${dataText(part.output)}`;
    case "data":
      return dataText(part.value);
    case "custom":
      return dataText({ type: part.kind, value: part.value });
  }
};

const messageKey = (message: NormalizedMessage) =>
  serialize({
    id: message.id,
    role: message.role,
    sender: message.senderName,
    parts: message.parts.map(({ providerMetadata, ...part }) => ({
      ...part,
      transcript: providerMetadata?.transcript,
    })),
  });

// Only a complete, ordered prior context is a proven replay prefix.
const replayPrefixLength = (
  context: readonly NormalizedMessage[],
  messages: readonly NormalizedMessage[],
) =>
  context.length > 0 &&
  context.length <= messages.length &&
  context.every((message, i) => messageKey(message) === messageKey(messages[i]))
    ? context.length
    : 0;

/** Pure projection of a selected source snapshot, independent of query row order. */
export function prepareTrace(
  observations: readonly TopicsObservation[],
): PreparedTrace {
  if (observations.length === 0) throw new Error("Trace has no observations");
  const [first] = observations;
  if (
    observations.some(
      (row) =>
        row.projectId !== first.projectId || row.traceId !== first.traceId,
    )
  ) {
    throw new Error(
      "A Topics transcript must contain exactly one project and trace",
    );
  }
  const rows = [...observations].sort(
    (a, b) => compare(a.startTime, b.startTime) || compare(a.id, b.id),
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  if (byId.size !== rows.length)
    throw new Error("Trace snapshot contains duplicate observation IDs");
  const parsed = new Map(
    rows.map((row) => [
      row.id,
      normalizeSpanIO({
        input: row.input,
        output: row.output,
        metadata: row.metadata,
      }),
    ]),
  );
  const blocks: TranscriptBlock[] = [];
  const coverage: TranscriptCoverage = {
    observationCount: rows.length,
    missingParentIds: [
      ...new Set(
        rows.flatMap((row) =>
          row.parentObservationId && !byId.has(row.parentObservationId)
            ? [row.parentObservationId]
            : [],
        ),
      ),
    ].sort(compare),
    cycleObservationIds: [],
    unfinishedObservationCount: rows.filter((row) => !row.endTime).length,
    overlappingSiblingPairs: 0,
    mediaPartCount: 0,
    truncatedBlockCount: 0,
    omittedBlockCount: 0,
  };
  const children = new Map<string | null, TopicsObservation[]>();
  for (const row of rows) {
    const key =
      row.parentObservationId && byId.has(row.parentObservationId)
        ? row.parentObservationId
        : null;
    children.set(key, [...(children.get(key) ?? []), row]);
  }
  for (const siblings of children.values()) {
    for (let index = 0; index < siblings.length; index++) {
      const previous = siblings[index];
      if (!previous.endTime) continue;
      for (const current of siblings.slice(index + 1)) {
        if (current.startTime >= previous.endTime) break;
        if (previous.parentObservationId === current.parentObservationId)
          coverage.overlappingSiblingPairs++;
      }
    }
  }
  const add = (
    row: TopicsObservation,
    block: Omit<TranscriptBlock, "observationId" | "parentObservationId">,
  ) => {
    const text = boundText(redactInlineMedia(block.text), 4_000);
    if (text !== block.text) coverage.truncatedBlockCount++;
    blocks.push({
      ...block,
      text,
      observationId: row.id,
      parentObservationId: row.parentObservationId,
    });
  };
  const emitted = new Set<string>();
  const active = new Set<string>();
  const priorByParent = new Map<
    string | null,
    { row: TopicsObservation; messages: NormalizedMessage[] }
  >();

  const emitSide = (
    row: TopicsObservation,
    side: "input" | "output",
    context: readonly NormalizedMessage[],
  ) => {
    const messages = parsed
      .get(row.id)!
      .messages.filter((message) => message.source === side);
    const raw = row[side];
    let decoded = raw;
    if (typeof raw === "string") {
      try {
        decoded = JSON.parse(raw);
      } catch {
        /* Plain text is already decoded. */
      }
    }
    const prefix = replayPrefixLength(context, messages);
    const unsafeToolIdentity =
      side === "output" &&
      messages.some((message) =>
        message.parts.some(
          (part) => part.type === "tool-call" && !part.toolCallId,
        ),
      );
    // The normalized parser's compatibility dedup can merge ID-less output calls.
    // Preserve the sanitized side without inferring call multiplicity.
    if (
      unsafeToolIdentity ||
      (messages.length === 0 && raw !== null && raw !== undefined)
    ) {
      coverage.mediaPartCount += messages
        .flatMap((message) => message.parts)
        .filter((part) => part.type === "file").length;
      add(row, {
        blockId: `${row.id}:${side}:raw`,
        source: side,
        kind: "data",
        text: dataText(decoded),
      });
      return;
    }
    if (prefix > 0)
      add(row, {
        blockId: `${row.id}:${side}:replay`,
        source: side,
        kind: "context-reference",
        text: `Replayed context: ${prefix} earlier messages; only newly added messages follow.`,
      });
    messages.slice(prefix).forEach((message, offset) => {
      const messageIndex = prefix + offset;
      message.parts.forEach((part, partIndex) => {
        if (part.type === "file") coverage.mediaPartCount++;
        add(row, {
          blockId: `${row.id}:${side}:${messageIndex}:${partIndex}`,
          source: side,
          messageIndex,
          partIndex,
          kind: part.type,
          role: message.senderName
            ? `${message.role} (${message.senderName})`
            : message.role,
          text: partText(part),
        });
      });
      if (message.finishReason)
        add(row, {
          blockId: `${row.id}:${side}:${messageIndex}:finish-reason`,
          source: "status",
          messageIndex,
          kind: "status",
          text: dataText({ finishReason: message.finishReason }),
        });
    });
    // Provider outcomes can live outside the normalized conversation.
    if (
      decoded &&
      typeof decoded === "object" &&
      !Array.isArray(decoded) &&
      !("messages" in decoded)
    ) {
      const status = Object.fromEntries(
        Object.entries(decoded).filter(([key]) =>
          [
            "status",
            "incomplete_details",
            "error",
            "finish_reason",
            "stop_reason",
          ].includes(key),
        ),
      );
      if ("choices" in decoded && Array.isArray(decoded.choices)) {
        const choices = decoded.choices.flatMap((choice: unknown, index) => {
          if (
            !choice ||
            typeof choice !== "object" ||
            !("finish_reason" in choice) ||
            choice.finish_reason == null
          )
            return [];
          return [{ index, finish_reason: choice.finish_reason }];
        });
        if (choices.length) status.choices = choices;
      }
      if (Object.keys(status).length)
        add(row, {
          blockId: `${row.id}:${side}:provider-status`,
          source: "status",
          kind: "status",
          text: dataText(status),
        });
    }
    // A messages envelope can also carry domain state outside the conversation.
    if (
      decoded &&
      typeof decoded === "object" &&
      !Array.isArray(decoded) &&
      "messages" in decoded
    ) {
      const additionalData = Object.fromEntries(
        Object.entries(decoded).filter(
          ([key]) => key !== "messages" && key !== "tools",
        ),
      );
      if (Object.keys(additionalData).length)
        add(row, {
          blockId: `${row.id}:${side}:data`,
          source: side,
          kind: "data",
          text: dataText(additionalData),
        });
    }
  };

  const emit = (
    row: TopicsObservation,
    ancestorInput: readonly NormalizedMessage[],
  ) => {
    if (active.has(row.id)) {
      coverage.cycleObservationIds.push(row.id);
      return;
    }
    if (emitted.has(row.id)) return;
    active.add(row.id);
    add(row, {
      blockId: `${row.id}:structure`,
      source: "structure",
      kind: "span",
      text: `${row.type} ${row.name}${row.parentObservationId && !byId.has(row.parentObservationId) ? " [parent missing]" : ""}`,
    });
    const prior = priorByParent.get(row.parentObservationId);
    const priorContext =
      row.type === "GENERATION" &&
      prior?.row.endTime &&
      prior.row.endTime <= row.startTime
        ? prior.messages
        : ancestorInput;
    emitSide(row, "input", priorContext);
    const ownInput = parsed
      .get(row.id)!
      .messages.filter((message) => message.source === "input");
    const definitions = parsed.get(row.id)!.toolDefinitions;
    if (definitions.length)
      add(row, {
        blockId: `${row.id}:input:tools`,
        source: "input",
        kind: "tool-definitions",
        text: dataText(
          definitions.map(({ name, description }) => ({ name, description })),
        ),
      });
    for (const child of children.get(row.id) ?? []) emit(child, ownInput);
    emitSide(row, "output", ownInput);
    if (row.level !== "DEFAULT" || row.statusMessage)
      add(row, {
        blockId: `${row.id}:status`,
        source: "status",
        kind: "status",
        text: `${row.level}: ${row.statusMessage ?? ""}`,
      });
    if (row.type === "GENERATION")
      priorByParent.set(row.parentObservationId, {
        row,
        messages: parsed.get(row.id)!.messages,
      });
    active.delete(row.id);
    emitted.add(row.id);
  };
  for (const row of children.get(null) ?? []) emit(row, []);
  for (const row of rows) if (!emitted.has(row.id)) emit(row, []);
  coverage.cycleObservationIds.sort(compare);
  return {
    projectId: first.projectId,
    traceId: first.traceId,
    sourceSnapshotHash: hashTraceSnapshot(rows),
    assemblerVersion: "1",
    blocks,
    coverage,
  };
}

/** One versioned model input for every facet; model budgets never alter its evidence. */
export function serializeTraceTranscript(prepared: PreparedTrace) {
  const transcriptVersion = "2";
  const text = [
    serialize({ transcriptVersion }),
    ...prepared.blocks.map(serialize),
    serialize({ coverage: prepared.coverage }),
  ].join("\n");
  return {
    text,
    transcriptVersion,
    sourceReferences: prepared.blocks.map(
      ({ blockId, observationId, source, messageIndex, partIndex }) => ({
        blockId,
        observationId,
        source,
        ...(messageIndex !== undefined ? { messageIndex, partIndex } : {}),
      }),
    ),
    coverage: prepared.coverage,
    inputHash: hash({ transcriptVersion, text }),
  };
}
