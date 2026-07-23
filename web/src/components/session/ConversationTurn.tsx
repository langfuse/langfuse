import React from "react";
import { ChevronRight } from "lucide-react";
import { deepParseJson } from "@langfuse/shared";

import { MarkdownView } from "@/src/components/ui/MarkdownViewer";
import { useSessionDetailStore } from "@/src/components/session/SessionDetailStoreProvider";
import { type SessionTraceObservation } from "@/src/components/session/SessionObservationIO";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { usdFormatter, compactNumberFormatter } from "@/src/utils/numbers";
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

/**
 * COL 3 turn of the session-detail redesign: right-aligned user bubble, then
 * each generation flowing unboxed (markdown), its tool-call lines (diamond +
 * name chip → inspector), and a hover-only mono footer (→ inspector).
 */
export const ConversationTurn = ({
  model,
  turnNumber,
  traceId,
}: {
  model: ConversationTurnModel;
  turnNumber: number;
  traceId: string;
}) => {
  const capture = usePostHogClientCapture();
  const openInspector = useSessionDetailStore(
    (state) => state.actions.openInspector,
  );

  const inspect = (observationId: string, observationType: string) => {
    capture("session_detail:observation_inspector_open", {
      observationType,
      source: "conversation",
    });
    openInspector({ traceId, observationId });
  };

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <div className="mb-4 flex justify-end">
        <div className="bg-muted/60 max-w-[80%] rounded-[10px] border px-4 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap">
          {model.userText}
        </div>
      </div>
      {model.generations.map(({ observation, text, tools }) => (
        <div key={observation.id} className="group mb-5">
          <MarkdownView markdown={text} />
          {tools.map((tool) => (
            <button
              key={tool.id}
              type="button"
              onClick={() => inspect(tool.id, tool.type)}
              className="text-muted-foreground hover:text-foreground my-1.5 flex items-center gap-2 text-left"
            >
              <span className="bg-muted-foreground/70 border-muted-foreground mx-0.5 h-2 w-2 shrink-0 rotate-45 border" />
              <span className="text-xs">Tool call</span>
              <span className="bg-muted/70 text-foreground rounded-sm border px-1.5 py-0.5 font-mono text-xs font-bold">
                {tool.name ?? tool.id}
              </span>
              <ChevronRight className="h-3 w-3" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => inspect(observation.id, observation.type)}
            className={cn(
              "text-muted-foreground hover:text-foreground mt-2 flex items-center gap-2 font-mono text-[11px]",
              "opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100",
            )}
          >
            <span>Turn {turnNumber}</span>
            <span className="text-muted-foreground/50">/</span>
            <span>
              {compactNumberFormatter(observation.inputUsage)}→
              {compactNumberFormatter(observation.outputUsage)}
            </span>
            {observation.totalCost !== null ? (
              <>
                <span className="text-muted-foreground/50">/</span>
                <span>{usdFormatter(observation.totalCost)}</span>
              </>
            ) : null}
            {observation.model ? (
              <>
                <span className="text-muted-foreground/50">/</span>
                <span>{observation.model}</span>
              </>
            ) : null}
            <span className="text-muted-foreground/50">/</span>
            <span className="font-bold">Generation</span>
          </button>
        </div>
      ))}
    </div>
  );
};
