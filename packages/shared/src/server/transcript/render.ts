import type { Observation } from "../../domain";
import type {
  NormalizedMessage,
  NormalizedMessagePart,
} from "../../utils/normalized-io";
import { normalizeIO } from "../normalized-io";
import { orderObservations } from "./ordering";
import { assembleTranscript } from "./transcript";
import type { Transcript } from "./types";
import {
  transcriptRenderConfigSchema,
  type TranscriptRenderConfig,
} from "./render-config";

export const transcriptBlockTypes = [
  "user",
  "assistant",
  "system",
  "reasoning",
  "tool_calls",
  "tool_results",
  "tool_definitions",
  "errors",
  "run_io",
  "observations",
] as const;

export type TranscriptBlockType = (typeof transcriptBlockTypes)[number];
type BlockCharacters = { raw: number; clipped: number };
type Line = { text: string; removable: boolean; history?: boolean };
type PartEvent = {
  kind: "part";
  thread: number;
  message: NormalizedMessage;
  part: NormalizedMessagePart;
  observationIndex: number;
  sequence: number;
  history: boolean;
  callNumber?: number;
  toolName?: string;
  finalOutput?: boolean;
};
type ErrorEvent = {
  kind: "error";
  observation: Observation;
  observationIndex: number;
  thread: number | null;
};
type ObservationEvent = {
  kind: "observation";
  observation: Observation;
  observationIndex: number;
  thread: number | null;
};
type CurrentEvent = PartEvent | ErrorEvent | ObservationEvent;
type RenderedEvent = { event: CurrentEvent; text: string };

const redactInlineMedia = (text: string): string =>
  text.replace(/data:[^:;,\s]+;base64,[A-Za-z0-9+/=_-]+/g, "[media omitted]");

/** Render an assembled trace for Topics without assembling it a second time. */
export function renderTranscript(
  transcript: Transcript | null,
  observations: Observation[],
  configInput: TranscriptRenderConfig,
  countTokens?: (text: string) => number,
): {
  text: string;
  tokens: number | null;
  stats: {
    blocksCut: number;
    messagesOmitted: number;
    blockCharacters: Record<TranscriptBlockType, BlockCharacters>;
    historyCharacters: number;
    currentTurnCharacters: number;
  };
} {
  const config = transcriptRenderConfigSchema.parse(configInput);
  let blocksCut = 0;
  const blockCharacters = Object.fromEntries(
    transcriptBlockTypes.map((block) => [block, { raw: 0, clipped: 0 }]),
  ) as Record<TranscriptBlockType, BlockCharacters>;

  const clip = (raw: string, maxChars: number, block: TranscriptBlockType) => {
    let text = redactInlineMedia(raw);
    if (config.collapseWhitespace) text = text.replace(/\s+/g, " ").trim();
    blockCharacters[block].raw += text.length;
    if (text.length > maxChars) {
      blocksCut++;
      const head = Math.round(maxChars * config.headRatio);
      const tail = maxChars - head;
      const omitted = (text.length - maxChars).toLocaleString("en-US");
      text =
        `${text.slice(0, head)} … [${omitted} chars omitted] … ${tail ? text.slice(-tail) : ""}`.trim();
    }
    blockCharacters[block].clipped += text.length;
    return text;
  };
  const json = (value: unknown) =>
    typeof value === "string" ? value : (JSON.stringify(value) ?? "");
  const labeled = (
    label: string,
    content: string,
    maxChars: number,
    block: TranscriptBlockType,
  ) =>
    maxChars === 0
      ? `[${label}]`
      : `[${label}] ${clip(content, maxChars, block)}`.trimEnd();
  const partContent = (part: NormalizedMessagePart): string => {
    switch (part.type) {
      case "text":
        return part.text;
      case "reasoning":
        return part.content.kind === "text" ? part.content.text : "";
      case "tool-call":
        return `${part.toolName} ${json(part.input)}`;
      case "tool-result":
        return json(part.output);
      case "file":
        return `[${part.mediaType ?? "file"} omitted]`;
      case "data":
        return json(part.value);
      case "custom":
        return json({ [part.kind]: part.value });
    }
  };
  const rootContent = (
    observation: Observation,
    source: "input" | "output",
  ) => {
    const value = observation[source];
    const parts = normalizeIO({
      kind: "io",
      io: {
        input: source === "input" ? value : undefined,
        output: source === "output" ? value : undefined,
        metadata: observation.metadata,
      },
    })
      .messages.filter((message) => message.source === source)
      .flatMap((message) => message.parts.map(partContent))
      .filter(Boolean);
    return parts.length ? parts.join("\n") : json(value);
  };

  const observationIndices = new Map(
    observations.map((observation, index) => [observation.id, index]),
  );
  const observationById = new Map(
    observations.map((observation) => [observation.id, observation]),
  );
  const threads = transcript?.threads ?? [];
  const historyEvents: PartEvent[] = [];
  const currentEvents: PartEvent[] = [];
  let sequence = 0;
  threads.forEach((thread, threadIndex) => {
    for (const message of config.history === "include"
      ? thread.conversationHistory
      : []) {
      for (const part of message.parts)
        historyEvents.push({
          kind: "part",
          thread: threadIndex,
          message,
          part,
          observationIndex: -1,
          sequence: sequence++,
          history: true,
        });
    }
    for (const message of thread.currentTurn.messages) {
      for (const part of message.parts)
        currentEvents.push({
          kind: "part",
          thread: threadIndex,
          message,
          part,
          observationIndex:
            observationIndices.get(message.observationId) ??
            Number.MAX_SAFE_INTEGER,
          sequence: sequence++,
          history: false,
        });
    }
  });
  currentEvents.sort(
    (a, b) =>
      a.observationIndex - b.observationIndex || a.sequence - b.sequence,
  );

  // Match each result to a preceding call in its thread. Replayed calls can
  // share IDs with current calls, so an ID match uses the most recent call.
  const allPartEvents = [...historyEvents, ...currentEvents];
  let nextCallNumber = 0;
  const callsById = new Map<string, PartEvent[]>();
  const callsByName = new Map<string, PartEvent[]>();
  const callKey = (thread: number, value: string) => `${thread}:${value}`;
  const matchedCalls = new Set<PartEvent>();
  const resultMessages = new WeakMap<NormalizedMessage, number | null>();
  const takeCall = (
    calls: PartEvent[] | undefined,
    newest: boolean,
    history: boolean,
  ) => {
    const available = calls?.filter(
      (candidate) => !matchedCalls.has(candidate),
    );
    const sameSection = available?.filter(
      (candidate) => candidate.history === history,
    );
    const candidates = sameSection?.length ? sameSection : available;
    const call = newest ? candidates?.at(-1) : candidates?.[0];
    if (call) matchedCalls.add(call);
    return call?.callNumber;
  };
  for (const event of allPartEvents) {
    if (event.part.type === "tool-call" && config.toolCalls.include) {
      if (!event.history) event.callNumber = ++nextCallNumber;
      const name = callKey(event.thread, event.part.toolName);
      callsByName.set(name, [...(callsByName.get(name) ?? []), event]);
      if (event.part.toolCallId) {
        const id = callKey(event.thread, event.part.toolCallId);
        callsById.set(id, [...(callsById.get(id) ?? []), event]);
      }
      continue;
    }
    const isResult =
      event.part.type === "tool-result" || event.message.role === "tool";
    if (!isResult) continue;
    event.toolName =
      (event.part.type === "tool-result" ? event.part.toolName : undefined) ??
      ("observationId" in event.message
        ? observationById.get(event.message.observationId as string)?.name
        : undefined) ??
      event.message.senderName ??
      "";
    if (event.message.role === "tool" && resultMessages.has(event.message)) {
      event.callNumber = resultMessages.get(event.message) ?? undefined;
      continue;
    }
    const id = event.part.type === "tool-result" ? event.part.toolCallId : null;
    event.callNumber = id
      ? takeCall(callsById.get(callKey(event.thread, id)), true, event.history)
      : takeCall(
          callsByName.get(callKey(event.thread, event.toolName)),
          false,
          event.history,
        );
    if (event.message.role === "tool")
      resultMessages.set(event.message, event.callNumber ?? null);
  }

  const comparable = (value: string) => value.replace(/\s+/g, " ").trim();
  const firstResponse = currentEvents.findIndex(
    (event) =>
      event.message.role === "assistant" || event.part.type === "tool-result",
  );
  const requestMessage = (
    firstResponse < 0 ? currentEvents : currentEvents.slice(0, firstResponse)
  )
    .filter((event) => event.message.role === "user")
    .at(-1)?.message;
  const root = observations.find(
    (observation) => observation.parentObservationId === null,
  );
  const rootInput =
    config.runIO.include && !requestMessage && root?.input != null
      ? rootContent(root, "input")
      : null;
  const rootOutput =
    config.runIO.include && root?.output != null
      ? rootContent(root, "output")
      : null;
  const finalEvent = [...currentEvents]
    .reverse()
    .find(
      (event) =>
        event.part.type === "tool-result" ||
        ((event.message.role === "assistant" ||
          event.message.role === "tool") &&
          (event.part.type === "text" ||
            event.part.type === "data" ||
            event.part.type === "custom")),
    );
  const finalMessageText = finalEvent?.message.parts
    .filter(
      (part) =>
        part.type === "text" ||
        part.type === "data" ||
        part.type === "custom" ||
        part.type === "tool-result",
    )
    .map(partContent)
    .join("\n");
  const outputMatchesMessage =
    !!rootOutput &&
    !!finalMessageText &&
    comparable(rootOutput) === comparable(finalMessageText);
  if (outputMatchesMessage && finalEvent) finalEvent.finalOutput = true;
  const partLine = (event: PartEvent): string | null => {
    const { message, part } = event;
    const role =
      message.role === "tool" ? config.toolResults : config[message.role];
    const roleLabel = message.senderName
      ? `${message.role} (${message.senderName})`
      : message.role;
    let userLabel = roleLabel;
    if (message.role === "user" && message === requestMessage)
      userLabel = `${roleLabel} · request`;
    else if (event.finalOutput && message.role === "assistant")
      userLabel = `${roleLabel} · final output`;
    const resultLabel =
      `tool ${event.toolName ?? ""}${event.callNumber ? ` #${event.callNumber}` : ""} ←${event.finalOutput ? " FINAL OUTPUT" : ""}`
        .replace(/\s+/g, " ")
        .trim();
    if (message.role === "tool" && part.type !== "tool-result") {
      return role.include && !(part.type === "file" && part.reasoning)
        ? labeled(resultLabel, partContent(part), role.maxChars, "tool_results")
        : null;
    }
    switch (part.type) {
      case "text":
        return role.include
          ? labeled(
              userLabel,
              part.text,
              role.maxChars,
              message.role === "tool" ? "tool_results" : message.role,
            )
          : null;
      case "reasoning":
        return config.reasoning.include && part.content.kind === "text"
          ? labeled(
              `${roleLabel} · reasoning`,
              part.content.text,
              config.reasoning.maxChars,
              "reasoning",
            )
          : null;
      case "tool-call":
        return config.toolCalls.include
          ? labeled(
              `${roleLabel} → ${part.toolName}${event.callNumber ? ` #${event.callNumber}` : ""}${part.invalid ? " (invalid)" : ""}`,
              json(part.input),
              config.toolCalls.maxChars,
              "tool_calls",
            )
          : null;
      case "tool-result":
        return config.toolResults.include
          ? labeled(
              `${resultLabel}${part.isError ? " ERROR" : ""}`,
              json(part.output),
              config.toolResults.maxChars,
              "tool_results",
            )
          : null;
      case "file":
        return role.include && !part.reasoning
          ? `[${userLabel}] [${part.mediaType ?? "file"} omitted]`
          : null;
      case "data":
      case "custom":
        return role.include
          ? labeled(
              userLabel,
              partContent(part),
              role.maxChars,
              message.role === "tool" ? "tool_results" : message.role,
            )
          : null;
    }
  };

  const history = historyEvents
    .map((event): RenderedEvent | null => {
      const text = partLine(event);
      return text ? { event, text } : null;
    })
    .filter((event): event is RenderedEvent => event !== null);
  const currentWithErrors: CurrentEvent[] = [...currentEvents];
  const threadByObservation = new Map(
    currentEvents.map((event) => [event.observationIndex, event.thread]),
  );
  const representedTools = new Set(
    currentEvents
      .filter(
        (event) =>
          event.message.role === "tool" || event.part.type === "tool-result",
      )
      .flatMap((event) =>
        "observationId" in event.message
          ? [event.message.observationId as string]
          : [],
      ),
  );
  if (config.observations.include) {
    observations.forEach((observation, observationIndex) => {
      if (observation.type === "TOOL" && representedTools.has(observation.id))
        return;
      currentWithErrors.push({
        kind: "observation",
        observation,
        observationIndex,
        thread: threadByObservation.get(observationIndex) ?? null,
      });
    });
  }
  if (config.errors.include) {
    observations.forEach((observation, observationIndex) => {
      if (
        observation.level === "ERROR" ||
        (observation.level === "WARNING" && observation.statusMessage)
      )
        currentWithErrors.push({
          kind: "error",
          observation,
          observationIndex,
          thread: threadByObservation.get(observationIndex) ?? null,
        });
    });
  }
  currentWithErrors.sort(
    (a, b) =>
      a.observationIndex - b.observationIndex ||
      { observation: 0, part: 1, error: 2 }[a.kind] -
        { observation: 0, part: 1, error: 2 }[b.kind] ||
      (a.kind === "part" && b.kind === "part" ? a.sequence - b.sequence : 0),
  );
  const current = currentWithErrors
    .map((event): RenderedEvent | null => {
      let text: string | null;
      if (event.kind === "part") text = partLine(event);
      else if (event.kind === "observation")
        text = labeled(
          event.observation.type.toLowerCase(),
          event.observation.name ?? "",
          config.observations.maxChars,
          "observations",
        );
      else
        text = labeled(
          `${event.observation.level === "WARNING" ? "warning" : "error"} ${event.observation.type} ${event.observation.name ?? ""}`.trim(),
          event.observation.statusMessage ?? "",
          config.errors.maxChars,
          "errors",
        );
      return text ? { event, text } : null;
    })
    .filter((event): event is RenderedEvent => event !== null);

  const rootInputLine = rootInput
    ? labeled("input · request", rootInput, config.runIO.maxChars, "run_io")
    : null;
  const rootOutputLine =
    rootOutput && !outputMatchesMessage
      ? labeled("final output", rootOutput, config.runIO.maxChars, "run_io")
      : null;

  const errorObservations = new Set(
    currentWithErrors
      .filter((event): event is ErrorEvent => event.kind === "error")
      .map((event) => event.observation.id),
  );
  for (const event of currentEvents) {
    if (
      config.toolResults.include &&
      event.part.type === "tool-result" &&
      event.part.isError
    ) {
      if ("observationId" in event.message)
        errorObservations.add(event.message.observationId as string);
    }
  }
  const userMessages = new Set(
    config.user.include
      ? currentEvents
          .filter((event) => event.message.role === "user")
          .map((event) => event.message)
      : [],
  );
  const runToolCalls = config.toolCalls.include
    ? currentEvents.filter((event) => event.part.type === "tool-call").length
    : 0;
  const facts = (omitted: number) =>
    `threads: ${threads.length} · rendered user entries: ${userMessages.size} · rendered tool calls: ${runToolCalls} · error signals: ${errorObservations.size} · omitted lines: ${omitted}`;

  const lines: Line[] = [];
  const header = (text: string) => lines.push({ text, removable: false });
  header("<run_facts>");
  const factsLine: Line = { text: facts(0), removable: false };
  lines.push(factsLine);
  header("</run_facts>");

  if (config.toolDefinitions.include) {
    const definitions = new Map<string, string>();
    for (const observation of observations) {
      if (observation.type !== "GENERATION") continue;
      const io = {
        input: observation.input,
        output: undefined,
        metadata: observation.metadata,
      };
      for (const definition of normalizeIO({ kind: "io", io })
        .toolDefinitions) {
        if (!definitions.has(definition.name))
          definitions.set(
            definition.name,
            definition.description?.split(/(?<=\.)\s/)[0] ?? "",
          );
      }
    }
    if (definitions.size) {
      header("<tools>");
      for (const [name, description] of definitions)
        header(
          labeled(
            name,
            description,
            config.toolDefinitions.maxChars,
            "tool_definitions",
          ).replace(/^\[(.*?)\]/, "- $1:"),
        );
      header("</tools>");
    }
  }

  const addEvents = (events: RenderedEvent[], historySection: boolean) => {
    let activeThread: number | null = null;
    for (const { event, text } of events) {
      const thread = event.thread;
      if (threads.length > 1 && thread !== activeThread) {
        if (activeThread !== null) header("</thread>");
        if (thread !== null) header(`<thread n="${thread + 1}">`);
        activeThread = thread;
      }
      lines.push({
        text,
        removable: event.kind === "part",
        history: historySection,
      });
    }
    if (threads.length > 1 && activeThread !== null) header("</thread>");
  };
  if (history.length) {
    header('<earlier_conversation source="replayed input">');
    addEvents(history, true);
    header("</earlier_conversation>");
  }
  if (rootInputLine || current.length || rootOutputLine) {
    header("<this_run>");
    if (rootInputLine)
      lines.push({ text: rootInputLine, removable: false, history: false });
    addEvents(current, false);
    if (rootOutputLine)
      lines.push({ text: rootOutputLine, removable: false, history: false });
    header("</this_run>");
  }

  const lastPart = [...current]
    .reverse()
    .find(({ event }) => event.kind === "part")?.event;
  let lastAction = "none";
  if (lastPart?.kind === "part") {
    if (lastPart.part.type === "tool-call") lastAction = "assistant tool call";
    else if (
      lastPart.part.type === "tool-result" ||
      lastPart.message.role === "tool"
    )
      lastAction = "tool result";
    else if (lastPart.message.role === "user") lastAction = "user message";
    else if (lastPart.part.type === "reasoning")
      lastAction = "assistant reasoning";
    else if (lastPart.message.role === "assistant")
      lastAction = "assistant text";
    else lastAction = `${lastPart.message.role} message`;
  }
  header("<end_of_run>");
  header(`last action: ${lastAction}`);
  if (rootOutputLine) header("final output: application output");
  else if (outputMatchesMessage)
    header(
      `final output: ${finalEvent?.part.type === "tool-result" || finalEvent?.message.role === "tool" ? "tool result" : "assistant"}`,
    );
  header("</end_of_run>");

  // Keep headings and trace-level I/O; drop ordinary lines from the middle.
  const removable = lines.filter((line) => line.removable);
  const select = (keep: number): Line[] => {
    const kept = new Set([
      ...removable.slice(0, Math.ceil(keep / 2)),
      ...removable.slice(removable.length - Math.floor(keep / 2)),
    ]);
    const selected: Line[] = [];
    let marked = false;
    for (const line of lines) {
      if (!line.removable || kept.has(line)) selected.push(line);
      else if (!marked) {
        selected.push({
          text: `[… ${removable.length - keep} lines omitted …]`,
          removable: false,
        });
        marked = true;
      }
    }
    return selected.map((line) =>
      line === factsLine
        ? { ...line, text: facts(removable.length - keep) }
        : line,
    );
  };
  const tokensOf = (keep: number) =>
    countTokens!(
      select(keep)
        .map((line) => line.text)
        .join("\n"),
    );
  let keep = removable.length;
  if (
    countTokens &&
    config.maxTokens !== null &&
    tokensOf(keep) > config.maxTokens
  ) {
    let low = 0;
    let high = keep - 1;
    while (low < high) {
      const middle = low + Math.ceil((high - low) / 2);
      if (tokensOf(middle) <= config.maxTokens) low = middle;
      else high = middle - 1;
    }
    keep = low;
  }
  const selected = select(keep);
  const text = selected.map((line) => line.text).join("\n");
  const historyCharacters = selected
    .filter((line) => line.history === true)
    .reduce((sum, line) => sum + line.text.length, 0);
  const currentTurnCharacters = selected
    .filter((line) => line.history === false)
    .reduce((sum, line) => sum + line.text.length, 0);
  return {
    text,
    tokens: countTokens ? countTokens(text) : null,
    stats: {
      blocksCut,
      messagesOmitted: removable.length - keep,
      blockCharacters,
      historyCharacters,
      currentTurnCharacters,
    },
  };
}

/** Assemble only for callers that do not already have the shared transcript. */
export function renderTranscriptFromObservations(
  observations: Observation[],
  configInput: TranscriptRenderConfig,
  countTokens?: (text: string) => number,
) {
  const orderedObservations = orderObservations(observations);
  return renderTranscript(
    assembleTranscript(orderedObservations),
    orderedObservations,
    configInput,
    countTokens,
  );
}
