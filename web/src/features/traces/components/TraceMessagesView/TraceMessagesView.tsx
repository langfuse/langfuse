/**
 * TraceMessagesView - the trace as a conversation transcript
 *
 * Internal preview behind the `traceMessages` flag. Renders the transcript
 * assembled server-side from the trace's generations and tools with the same
 * message components as the formatted IO view: replayed conversation history
 * first, then the current turn with links to the observations that emitted it.
 */

import { useMemo } from "react";
import type { NormalizedMessage } from "@langfuse/shared/src/utils/normalized-io";
import { api, type RouterOutputs } from "@/src/utils/api";
import { Button } from "@/src/components/ui/button";
import { useMarkdownRenderCharacterLimit } from "@/src/hooks/useMarkdownRenderCharacterLimit";
import { type MediaReturnType } from "@/src/features/media/validation";
import { ChatMessageList } from "@/src/features/traces/components/ChatMessageList";
import { useSelection } from "@/src/features/traces/contexts/SelectionContext";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { toIOPreview } from "@/src/features/traces/parsers/toIOPreview";
import { useDesktopLayoutContextOptional } from "../TraceLayoutDesktop";

type Transcript = NonNullable<
  RouterOutputs["events"]["transcriptByTraceId"]["transcript"]
>;
type Thread = Transcript["threads"][number];

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

  const { threads } = data.transcript;
  return (
    <div className="flex h-full w-full flex-col gap-6 overflow-y-auto p-3">
      {data.cutoff && (
        <Notice>
          This trace exceeds the observation cap. Later observations are not
          part of the transcript.
        </Notice>
      )}
      {threads.map((thread, index) => (
        <ThreadBlock
          key={index}
          thread={thread}
          title={threads.length > 1 ? `Thread ${index + 1}` : undefined}
          observationNames={observationNames}
          projectId={trace.projectId}
          traceId={trace.id}
        />
      ))}
    </div>
  );
}

function ThreadBlock({
  thread,
  title,
  observationNames,
  projectId,
  traceId,
}: {
  thread: Thread;
  title?: string;
  observationNames: Map<string, string>;
  projectId: string;
  traceId: string;
}) {
  const { setSelectedNodeId } = useSelection();
  const layout = useDesktopLayoutContextOptional();
  // Media of the emitting observations, so inline references resolve the way
  // they do in the formatted view. History has no emitter to ask.
  const mediaQueries = api.useQueries((t) =>
    thread.currentTurn.observations.map(({ id }) =>
      t.media.getByTraceOrObservationId(
        { projectId, traceId, observationId: id },
        { refetchOnWindowFocus: false, staleTime: 50 * 60 * 1000 },
      ),
    ),
  );
  const media = mediaQueries.flatMap((query) => query.data ?? []);

  const selectObservation = (id: string) => {
    setSelectedNodeId(id);
    layout?.expandDetailPanel();
  };

  return (
    <section className="flex flex-col gap-3">
      {title && <h3 className="text-sm font-bold">{title}</h3>}
      {thread.conversationHistory.length > 0 && (
        <>
          <SectionLabel>Conversation history</SectionLabel>
          <div className="opacity-70">
            <MessageList messages={thread.conversationHistory} media={[]} />
          </div>
          <SectionLabel>Current turn</SectionLabel>
        </>
      )}
      <div className="flex flex-wrap gap-1">
        {thread.currentTurn.observations.map(({ id }) => (
          <Button
            key={id}
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs"
            title="Show observation"
            onClick={() => selectObservation(id)}
          >
            {observationNames.get(id) ?? id}
          </Button>
        ))}
      </div>
      <MessageList messages={thread.currentTurn.messages} media={media} />
    </section>
  );
}

/** Formatted IO rendering of normalized messages, without re-parsing. */
function MessageList({
  messages,
  media,
}: {
  messages: NormalizedMessage[];
  media: MediaReturnType[];
}) {
  const characterLimit = useMarkdownRenderCharacterLimit();
  const preview = useMemo(
    () =>
      toIOPreview(
        {
          messages,
          toolDefinitions: [],
          span: { input: undefined, output: undefined, metadata: undefined },
        },
        undefined,
      ),
    [messages],
  );
  // Same size gate as the formatted view.
  const shouldRenderMarkdown = useMemo(
    () => JSON.stringify(preview.allMessages).length <= characterLimit,
    [preview, characterLimit],
  );

  return (
    <div className="[&_.io-message-content]:px-2 [&_.io-message-header]:px-2">
      <ChatMessageList
        messages={preview.allMessages}
        shouldRenderMarkdown={shouldRenderMarkdown}
        media={media}
        currentView="pretty"
        messageToToolCallNumbers={preview.messageToToolCallNumbers}
        inputMessageCount={preview.inputMessageCount}
        collapseLongHistory={false}
      />
    </div>
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
