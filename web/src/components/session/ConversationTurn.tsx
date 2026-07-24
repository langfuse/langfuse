import React from "react";
import { ChevronRight, Fan, Wrench } from "lucide-react";
import { deepParseJson } from "@langfuse/shared";

import { MarkdownView } from "@/src/components/ui/MarkdownViewer";
import { useSessionDetailStore } from "@/src/components/session/SessionDetailStoreProvider";
import { type SessionTraceObservation } from "@/src/components/session/SessionObservationIO";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { usdFormatter } from "@/src/utils/numbers";
import { cn } from "@/src/utils/tailwind";

/**
 * The conversation-turn model of the session-detail redesign: one user
 * message followed by the turn's generations, each generation = assistant
 * text + the tool calls it made.
 *
 * Deliberately conservative: `buildTurnModel` returns null whenever the
 * turn's data does not clearly fit this shape (no generation, un-extractable
 * message content, …) and the caller falls back to the existing observation
 * rendering — the redesign must never hide payloads it cannot express.
 */
export type ConversationTurnModel = {
  userText: string;
  generations: Array<{
    observation: SessionTraceObservation;
    text: string;
    tools: SessionTraceObservation[];
  }>;
};

/** Extracts plain text from a ChatML-ish message content value. */
const contentToText = (content: unknown): string | null => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = content
      .map((part) => {
        if (typeof part === "string") return part;
        if (
          part &&
          typeof part === "object" &&
          typeof (part as { text?: unknown }).text === "string"
        ) {
          return (part as { text: string }).text;
        }
        return null;
      })
      .filter((part): part is string => part !== null);
    return parts.length > 0 ? parts.join("\n") : null;
  }
  return null;
};

const asMessageArray = (
  value: unknown,
): Array<Record<string, unknown>> | null => {
  const candidate =
    Array.isArray(value) ||
    !value ||
    typeof value !== "object" ||
    !Array.isArray((value as { messages?: unknown }).messages)
      ? value
      : (value as { messages: unknown }).messages;
  if (!Array.isArray(candidate)) return null;
  const messages = candidate.filter(
    (message): message is Record<string, unknown> =>
      message !== null && typeof message === "object",
  );
  return messages.length > 0 ? messages : null;
};

/** Last user message of a generation's input — the turn's new message. */
const extractUserText = (input: unknown): string | null => {
  if (typeof input === "string" && input.trim() !== "") return input;
  const messages = asMessageArray(input);
  if (!messages) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      const text = contentToText(messages[i].content);
      if (text && text.trim() !== "") return text;
    }
  }
  return null;
};

/** Assistant text of a generation's output. */
const extractAssistantText = (output: unknown): string | null => {
  if (typeof output === "string" && output.trim() !== "") return output;
  if (output && typeof output === "object" && !Array.isArray(output)) {
    const single = output as Record<string, unknown>;
    const text = contentToText(single.content ?? single.completion);
    if (text && text.trim() !== "") return text;
  }
  const messages = asMessageArray(output);
  if (messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const role = messages[i].role;
      if (role === "assistant" || role === undefined) {
        const text = contentToText(messages[i].content);
        if (text && text.trim() !== "") return text;
      }
    }
  }
  return null;
};

const parse = (value: unknown) =>
  deepParseJson(value, { maxSize: 300_000, maxDepth: 3 });

/**
 * Builds the turn model from a trace's observations (startTime-ordered).
 * Tool observations attach to the closest preceding generation.
 * Returns null when the data does not fit the design's turn shape.
 */
export const buildTurnModel = (
  observations: SessionTraceObservation[],
): ConversationTurnModel | null => {
  const sorted = [...observations].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime(),
  );
  const generations = sorted.filter(
    (observation) => observation.type === "GENERATION",
  );
  if (generations.length === 0) return null;
  // Truncated payloads can't be re-rendered faithfully — fall back.
  if (
    generations.some(
      (generation) => generation.inputTruncated || generation.outputTruncated,
    )
  )
    return null;

  const built: ConversationTurnModel["generations"] = [];
  for (const generation of generations) {
    const text = extractAssistantText(parse(generation.output));
    if (text === null) return null;
    built.push({ observation: generation, text, tools: [] });
  }

  const userText = extractUserText(parse(generations[0].input));
  if (userText === null) return null;

  // Attach each TOOL observation to the last generation that started before
  // it (tools called by the first generation land between generation 1 and 2).
  for (const observation of sorted) {
    if (observation.type !== "TOOL") continue;
    let owner = built[0];
    for (const candidate of built) {
      if (
        candidate.observation.startTime.getTime() <=
        observation.startTime.getTime()
      ) {
        owner = candidate;
      }
    }
    owner.tools.push(observation);
  }

  return { userText, generations: built };
};

/** Hover-revealed meta parts of a generation: `latency · cost` (real data
 *  only — parts without a datum are omitted). */
const generationMetaParts = (
  observation: SessionTraceObservation,
): string[] => {
  const parts: string[] = [];
  if (observation.latency !== null)
    parts.push(`${observation.latency.toFixed(2)}s`);
  if (observation.totalCost !== null)
    parts.push(usdFormatter(observation.totalCost, 2, 4));
  return parts;
};

/**
 * COL 3 turn of the v4 session design: right-aligned user bubble (click
 * selects the turn), tool-call rows with the orange name chip (→ inspector),
 * then each generation as a clickable hover block (→ inspector) with a mono
 * `model · latency · cost` meta row underneath.
 */
export const ConversationTurn = ({
  model,
  traceId,
  onSelectTurn,
}: {
  model: ConversationTurnModel;
  traceId: string;
  /** Selects this turn (rail sync + smooth scroll). */
  onSelectTurn?: () => void;
}) => {
  const capture = usePostHogClientCapture();
  const openInspector = useSessionDetailStore(
    (state) => state.actions.openInspector,
  );
  const inspectedObservationId = useSessionDetailStore(
    (state) => state.inspectedObservation?.observationId ?? null,
  );
  // The generation view control (ex "LLM Calls per Trace" presets): show
  // all generations of a turn, or only its first/last one.
  const generationView = useSessionDetailStore((state) => state.generationView);
  const visibleGenerations =
    generationView === "first"
      ? model.generations.slice(0, 1)
      : generationView === "last"
        ? model.generations.slice(-1)
        : model.generations;

  const inspect = (observationId: string, observationType: string) => {
    capture("session_detail:observation_inspector_open", {
      observationType,
      source: "conversation",
    });
    openInspector({ traceId, observationId });
  };

  // Opens the inspector for the generation unless the click hit an
  // interactive child (links, copy buttons) or the user is selecting text.
  const handleGenerationClick =
    (observationId: string, observationType: string) =>
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (
        target.closest(
          "a,button,input,textarea,select,[role='button'],[contenteditable='true']",
        )
      )
        return;
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) return;
      inspect(observationId, observationType);
    };

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onSelectTurn}
          className="bg-muted text-foreground max-w-[min(560px,82%)] rounded-sm px-4 py-2 text-left text-sm leading-[1.5] tracking-[-0.005em] break-words whitespace-pre-wrap"
        >
          {model.userText}
        </button>
      </div>
      {visibleGenerations.map(({ observation, text, tools }) => {
        const metaParts = generationMetaParts(observation);
        const isInspected = observation.id === inspectedObservationId;
        return (
          <div key={observation.id}>
            {tools.map((tool) => (
              <button
                key={tool.id}
                type="button"
                onClick={() => inspect(tool.id, tool.type)}
                className="hover:bg-muted mt-2 -ml-4 flex items-center gap-2 rounded-sm px-4 py-2 text-left transition-colors duration-150"
              >
                <Wrench
                  className="text-session-tool h-3.5 w-3.5 shrink-0"
                  strokeWidth={2}
                />
                <span className="text-muted-foreground text-[13px] whitespace-nowrap">
                  Tool call
                </span>
                <span
                  title={tool.name ?? tool.id}
                  className="text-session-tool bg-session-tool/10 min-w-0 truncate rounded-sm px-2 py-0.5 font-mono text-xs"
                >
                  {tool.name ?? tool.id}
                </span>
                <ChevronRight
                  className="text-foreground-tertiary h-3.5 w-3.5 shrink-0"
                  strokeWidth={1.6}
                />
              </button>
            ))}
            <div
              onClick={handleGenerationClick(observation.id, observation.type)}
              className={cn(
                "group/gen hover:bg-muted mt-4 mb-1 -ml-4 max-w-[min(620px,90%)] cursor-pointer rounded-sm px-4 py-2 transition-colors duration-150",
                isInspected && "bg-primary/5",
              )}
            >
              <MarkdownView markdown={text} />
              <div className="text-muted-foreground mt-3.5 flex items-center gap-2">
                <Fan
                  className="text-session-generation h-3.5 w-3.5 shrink-0"
                  strokeWidth={2}
                />
                <span className="min-w-0 truncate text-[13px]">
                  {observation.name ?? observation.model ?? "Generation"}
                </span>
                {metaParts.length > 0 ? (
                  <span
                    className={cn(
                      "text-[13px] whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover/gen:opacity-100",
                      isInspected && "opacity-100",
                    )}
                  >
                    {"· " + metaParts.join(" · ")}
                  </span>
                ) : null}
                <ChevronRight
                  className={cn(
                    "text-foreground-tertiary h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity duration-150 group-hover/gen:opacity-100",
                    isInspected && "opacity-100",
                  )}
                  strokeWidth={1.6}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
