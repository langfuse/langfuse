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
  level: string;
  statusMessage: string | null;
  input: unknown;
  output: unknown;
  metadata: unknown;
};

type TranscriptBlock = {
  source: "input" | "output" | "status" | "structure";
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

type PreparedTrace = {
  blocks: TranscriptBlock[];
  coverage: TranscriptCoverage;
};

const compare = (a: string, b: string) => {
  if (a === b) return 0;
  return a < b ? -1 : 1;
};
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

// Excluding colons keeps malformed data: prefixes from rescanning the same suffix.
const redactInlineMedia = (text: string): string =>
  text.replace(
    /data:[^:;,\s]+;base64,[A-Za-z0-9+/=_-]+/g,
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
      Object.entries(record).map(([key, nested]) => {
        if (["reasoning", "reasoning_content", "thinking"].includes(key))
          return [key, "[reasoning omitted]"];
        if (
          ["signature", "thoughtSignature", "encrypted_content"].includes(
            key,
          ) ||
          (key === "data" &&
            (record.type === "base64" ||
              typeof record.mimeType === "string" ||
              typeof record.mime_type === "string" ||
              field === "audio" ||
              field === "input_audio"))
        )
          return [key, "[opaque payload omitted]"];
        return [key, modelData(nested, key)];
      }),
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
  const focusedObservations = new Set(
    rows
      .filter((row) => row.type === "GENERATION" || row.type === "TOOL")
      .map((row) => row.id),
  );
  const seenContext = new Set<string>();
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
  const add = (row: TopicsObservation, block: TranscriptBlock) => {
    // Wrapper payloads add little to this PoC; keep their errors and status.
    if (
      focusedObservations.size > 0 &&
      !focusedObservations.has(row.id) &&
      block.source !== "status"
    )
      return;
    if (block.kind === "text" || block.kind === "tool-definitions") {
      const key = serialize({ role: block.role, text: block.text });
      // Repeated outputs remain visible; only repeated input context is skipped.
      if (block.source === "input" && seenContext.has(key)) return;
      seenContext.add(key);
    }
    blocks.push({
      ...block,
      text: redactInlineMedia(block.text),
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
        source: side,
        kind: "data",
        text: dataText(decoded),
      });
      return;
    }
    messages.slice(prefix).forEach((message) => {
      message.parts.forEach((part) => {
        if (part.type === "file") coverage.mediaPartCount++;
        add(row, {
          source: side,
          kind: part.type,
          role: message.senderName
            ? `${message.role} (${message.senderName})`
            : message.role,
          text: partText(part),
        });
      });
      if (message.finishReason)
        add(row, {
          source: "status",
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
    blocks,
    coverage,
  };
}

/** One compact JSON input for every facet, including JSON escaping in its limit. */
export function serializeTraceTranscript(prepared: PreparedTrace) {
  const maxCharacters = 10_000;
  const selectBlocks = (count: number) =>
    count >= prepared.blocks.length
      ? prepared.blocks
      : [
          ...prepared.blocks.slice(0, Math.ceil(count / 2)),
          ...prepared.blocks.slice(
            prepared.blocks.length - Math.floor(count / 2),
          ),
        ];
  const render = (blocks: TranscriptBlock[], textLimit: number) => {
    let truncatedBlockCount = 0;
    const entries = blocks.map((block) => {
      const text = boundText(block.text, textLimit);
      const role =
        block.role === undefined ? undefined : boundText(block.role, 64);
      if (text !== block.text || role !== block.role) truncatedBlockCount++;
      return { source: block.source, ...(role ? { role } : {}), text };
    });
    const coverage = {
      ...prepared.coverage,
      truncatedBlockCount,
      omittedBlockCount: prepared.blocks.length - blocks.length,
    };
    const records: unknown[] = [...entries];
    if (coverage.omittedBlockCount)
      records.splice(Math.ceil(blocks.length / 2), 0, {
        source: "truncation",
        text: `${coverage.omittedBlockCount} middle blocks omitted.`,
      });
    records.push({
      coverage: Object.fromEntries(
        Object.entries({
          observationCount: coverage.observationCount,
          missingParentCount: coverage.missingParentIds.length,
          cycleCount: coverage.cycleObservationIds.length,
          unfinishedObservationCount: coverage.unfinishedObservationCount,
          overlappingSiblingPairs: coverage.overlappingSiblingPairs,
          mediaPartCount: coverage.mediaPartCount,
          truncatedBlockCount,
          omittedBlockCount: coverage.omittedBlockCount,
        }).filter(([, count]) => count > 0),
      ),
    });
    return { text: serialize(records), coverage };
  };
  const largestFit = (
    min: number,
    max: number,
    fits: (value: number) => boolean,
  ) => {
    while (min < max) {
      const mid = Math.ceil((min + max) / 2);
      if (fits(mid)) min = mid;
      else max = mid - 1;
    }
    return min;
  };
  let blocks = prepared.blocks;
  let result = render(blocks, maxCharacters);
  if (result.text.length > maxCharacters) {
    // Keep short messages intact; shorten verbose messages before omitting blocks.
    if (render(blocks, 64).text.length > maxCharacters) {
      const count = largestFit(
        1,
        blocks.length,
        (count) => render(selectBlocks(count), 64).text.length <= maxCharacters,
      );
      blocks = selectBlocks(count);
    }
    const textLimit = largestFit(
      64,
      maxCharacters,
      (limit) => render(blocks, limit).text.length <= maxCharacters,
    );
    result = render(blocks, textLimit);
  }
  return {
    ...result,
    hasContent: blocks.some((block) => block.source !== "structure"),
    inputHash: hash(result.text),
  };
}
