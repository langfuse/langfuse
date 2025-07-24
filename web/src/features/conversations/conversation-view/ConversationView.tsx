import { useState, useEffect } from "react";
import { api } from "@/src/utils/api";
import { Card } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { ErrorPage } from "@/src/components/error-page";
import { JsonSkeleton } from "@/src/components/ui/CodeJsonViewer";
// import { IOPreview } from "@/src/components/trace/IOPreview";
import { Avatar, AvatarFallback } from "@/src/components/ui/avatar";
import { UserIcon, SparkleIcon } from "lucide-react";
import { MarkdownJsonView } from "@/src/components/ui/MarkdownJsonView";
import { deepParseJson } from "@langfuse/shared";

interface ConversationViewProps {
  sessionId: string;
  projectId: string;
}

interface ConversationMessage {
  id: string;
  name: string | null;
  timestamp: Date;
  input: string | null;
  output: string | null;
  userId: string | null;
  tags: string[];
  environment: string | null;
}

const ConversationMessage = ({
  message,
  projectId,
}: {
  message: ConversationMessage;
  projectId: string;
}) => {
  const input = deepParseJson(message.input);
  const output = deepParseJson(message.output);

  return (
    <>
      {input && (
        <div className="grid max-w-screen-md gap-2">
          <div className="flex flex-row items-center gap-2">
            <Avatar>
              <AvatarFallback>
                <UserIcon className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
            <div className="font-mono text-sm font-bold">{message.userId}</div>
          </div>
          <div className="relative overflow-hidden break-all rounded-lg bg-secondary p-4 pb-6 text-sm">
            <MarkdownJsonView
              // title="Input"
              className="ph-no-capture"
              content={input}
              customCodeHeaderClassName="bg-secondary"
              media={[]}
            />
            <div className="absolute bottom-2 right-2">
              <div className="text-xs text-muted-foreground">
                {message.timestamp.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}
      {output && (
        <div className="flex flex-wrap gap-4">
          <div className="grid max-w-screen-md gap-2">
            <div className="flex flex-row items-center gap-2">
              <Avatar>
                <AvatarFallback className="bg-pink-600 text-white">
                  <SparkleIcon className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div className="font-mono text-sm font-bold">DJB</div>
            </div>
            <div className="relative overflow-hidden break-all rounded-lg bg-secondary p-4 pb-6 text-sm">
              <MarkdownJsonView
                title="Output"
                className="ph-no-capture"
                content={output}
                customCodeHeaderClassName=""
                media={[]}
              />
              <div className="absolute bottom-2 right-2">
                <div className="text-xs text-muted-foreground">
                  {message.timestamp.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
          <div id="scores-container" className="flex-1 pt-10 sm:min-w-[500px]">
            <div
              id="inner-container"
              className="rounded border border-dashed border-white p-4"
            >
              <MessageScores id={message.id} projectId={projectId} />
            </div>
          </div>
        </div>
      )}
      {!input && !output && (
        <div className="border border-dashed border-white text-sm text-muted-foreground">
          This trace has no input or output messages.
        </div>
      )}
    </>
  );
};

export const ConversationView = ({
  sessionId,
  projectId,
}: ConversationViewProps) => {
  const sessionTraces = api.conversation.getSessionTraces.useQuery(
    {
      projectId,
      sessionId,
    },
    {
      retry(failureCount, error) {
        if (
          error.data?.code === "UNAUTHORIZED" ||
          error.data?.code === "NOT_FOUND"
        )
          return false;
        return failureCount < 3;
      },
    },
  );

  const messages = sessionTraces.data?.traces;

  if (sessionTraces.error?.data?.code === "UNAUTHORIZED") {
    return <ErrorPage message="You do not have access to this session." />;
  }

  if (sessionTraces.error?.data?.code === "NOT_FOUND") {
    return (
      <ErrorPage
        title="Session not found"
        message="The session is either still being processed or has been deleted."
        additionalButton={{
          label: "Retry",
          onClick: () => void window.location.reload(),
        }}
      />
    );
  }

  if (sessionTraces.isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="p-4">
            <JsonSkeleton className="h-32 w-full" numRows={5} />
          </Card>
        ))}
      </div>
    );
  }

  if (!messages || !messages.length) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-medium">
            No conversation messages found
          </div>
          <div className="text-sm text-muted-foreground">
            This session doesn&apos;t contain any traces with input/output
            messages.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            Turn{messages.length === 1 ? "" : "s"}: {messages.length}
          </Badge>
          <Badge variant="outline">
            Duration: {calculateDuration(messages)}
          </Badge>
          {/* <Badge variant="outline">Session: {sessionId}</Badge> */}
        </div>
      </div>
      {/* Conversation Messages */}
      <div className="grid gap-4 md:px-8">
        {messages &&
          messages.map((message) => (
            <ConversationMessage
              key={message.id}
              message={message}
              projectId={projectId}
            />
          ))}
      </div>
    </div>
  );
};

const calculateDuration = (messages: ConversationMessage[]): string => {
  if (messages.length < 2) return "0s";

  const sortedMessages = [...messages].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const firstMessage = sortedMessages[0];
  const lastMessage = sortedMessages[sortedMessages.length - 1];

  const durationMs =
    new Date(lastMessage.timestamp).getTime() -
    new Date(firstMessage.timestamp).getTime();

  if (durationMs < 1000) {
    return "<1s";
  }

  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }

  return `${seconds}s`;
};

function MessageScores({ id, projectId }: { id: string; projectId: string }) {
  const scoresQuery = api.conversation.getScoresForTraces.useQuery({
    projectId,
    traceIds: [id],
  });

  const mutateScores = api.conversation.upsertScore.useMutation({
    onSuccess: () => {
      console.log("Score updated");
    },
  });

  return (
    <div className="min-h-56">{scoresQuery.data?.scores.length} scores</div>
  );
}
