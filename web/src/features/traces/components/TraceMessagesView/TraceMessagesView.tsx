/**
 * TraceMessagesView - the trace as a conversation transcript
 *
 * Internal preview behind the `traceMessages` flag. Renders the transcript
 * assembled server-side from the trace's generations and tools: replayed
 * conversation history first, then the current turn with the observation
 * that emitted each message.
 */

import { Bot, Terminal, UserRound, Wrench } from "lucide-react";
import { useMemo } from "react";
import type {
  NormalizedMessage,
  NormalizedMessagePart,
} from "@langfuse/shared/src/utils/normalized-io";
import { api, type RouterOutputs } from "@/src/utils/api";
import { useSelection } from "@/src/features/traces/contexts/SelectionContext";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { cn } from "@/src/utils/tailwind";

type Transcript = NonNullable<
  RouterOutputs["events"]["transcriptByTraceId"]["transcript"]
>;
type Thread = Transcript["threads"][number];
type TranscriptMessage = NormalizedMessage & { observationId?: string };

const ROLE_PRESENTATION: Record<
  NormalizedMessage["role"],
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  system: { label: "System", icon: Terminal },
  user: { label: "User", icon: UserRound },
  assistant: { label: "Assistant", icon: Bot },
  tool: { label: "Tool", icon: Wrench },
};

export function TraceMessagesView() {
  const { trace, observations } = useTraceData();
  const { data, isLoading, error } = api.events.transcriptByTraceId.useQuery({
    projectId: trace.projectId,
    traceId: trace.id,
    timestamp: trace.timestamp,
  });
  const observationNames = useMemo(
    () => new Map(observations.map((o) => [o.id, o.name ?? o.id])),
    [observations],
  );

  if (isLoading) {
    return <Notice>Assembling messages…</Notice>;
  }
  if (error) {
    return <Notice>{error.message}</Notice>;
  }
  if (!data?.transcript) {
    return (
      <Notice>
        No messages. Transcripts are assembled from generations and tool
        observations with chat-shaped input and output.
      </Notice>
    );
  }

  return (
    <div className="flex flex-col gap-6 overflow-y-auto p-3">
      {data.cutoff && (
        <Notice>
          This trace exceeds the observation cap. Later observations are not
          part of the transcript.
        </Notice>
      )}
      {data.transcript.threads.map((thread, index) => (
        <ThreadBlock
          key={index}
          thread={thread}
          title={
            data.transcript && data.transcript.threads.length > 1
              ? `Thread ${index + 1}`
              : undefined
          }
          observationNames={observationNames}
        />
      ))}
    </div>
  );
}

function ThreadBlock({
  thread,
  title,
  observationNames,
}: {
  thread: Thread;
  title?: string;
  observationNames: Map<string, string>;
}) {
  const { setSelectedNodeId } = useSelection();
  return (
    <section className="flex flex-col gap-3">
      {title && <h3 className="text-sm font-bold">{title}</h3>}
      {thread.conversationHistory.length > 0 && (
        <>
          <SectionLabel>Conversation history</SectionLabel>
          <div className="flex flex-col gap-2 opacity-70">
            {thread.conversationHistory.map((message, index) => (
              <MessageBlock key={index} message={message} />
            ))}
          </div>
          <SectionLabel>Current turn</SectionLabel>
        </>
      )}
      <div className="flex flex-col gap-2">
        {thread.currentTurn.messages.map((message, index) => (
          <MessageBlock
            key={index}
            message={message}
            provenance={observationNames.get(message.observationId)}
            onSelectObservation={() => setSelectedNodeId(message.observationId)}
          />
        ))}
      </div>
    </section>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground flex items-center gap-2 text-xs tracking-wide uppercase">
      <span className="bg-border h-px flex-1" />
      {children}
      <span className="bg-border h-px flex-1" />
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground m-3 rounded-md border border-dashed p-3 text-sm">
      {children}
    </div>
  );
}

function MessageBlock({
  message,
  provenance,
  onSelectObservation,
}: {
  message: TranscriptMessage;
  /** Name of the observation that emitted the message, current turn only. */
  provenance?: string;
  onSelectObservation?: () => void;
}) {
  const presentation = ROLE_PRESENTATION[message.role];
  const Icon = presentation.icon;
  const sender =
    message.senderName && message.senderName !== presentation.label
      ? ` (${message.senderName})`
      : "";
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2",
        message.role === "user" ? "bg-muted" : "bg-muted/40",
      )}
    >
      <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs">
        <Icon className="h-3.5 w-3.5" />
        <span>
          {presentation.label}
          {sender}
        </span>
        {provenance && (
          <>
            <span>·</span>
            <button
              type="button"
              className="hover:text-foreground truncate underline-offset-2 hover:underline"
              onClick={onSelectObservation}
              title="Select observation"
            >
              {provenance}
            </button>
          </>
        )}
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        {message.parts.map((part, index) => (
          <PartBlock key={index} part={part} />
        ))}
      </div>
    </div>
  );
}

function PartBlock({ part }: { part: NormalizedMessagePart }) {
  switch (part.type) {
    case "text":
      return (
        <p className="break-words whitespace-pre-wrap">
          {part.refusal ? `(refusal) ${part.text}` : part.text}
        </p>
      );
    case "reasoning":
      return (
        <p className="text-muted-foreground break-words whitespace-pre-wrap italic">
          {part.content.kind === "text"
            ? part.content.text
            : `(reasoning: ${part.content.kind})`}
        </p>
      );
    case "tool-call":
      return (
        <JsonBlock
          title={`⚙ ${part.toolName}${part.toolCallId ? `  ${part.toolCallId}` : ""}`}
          value={part.input}
        />
      );
    case "tool-result":
      return (
        <JsonBlock
          title={`⤷ ${part.toolName ?? "tool result"}${part.toolCallId ? `  ${part.toolCallId}` : ""}${part.isError ? "  (error)" : ""}`}
          value={part.output}
        />
      );
    case "file":
      return (
        <p className="text-muted-foreground">
          📎 {part.mediaType ?? "file"} ({part.content.kind})
        </p>
      );
    case "data":
      return <JsonBlock title="Data" value={part.value} />;
    case "custom":
      return <JsonBlock title={`Custom ${part.kind}`} value={part.value} />;
  }
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="bg-background rounded border">
      <div className="text-muted-foreground border-b px-2 py-1 font-mono text-xs">
        {title}
      </div>
      <pre className="max-h-64 overflow-auto px-2 py-1 font-mono text-xs">
        {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
