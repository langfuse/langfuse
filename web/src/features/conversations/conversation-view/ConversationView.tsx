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

const ConversationMessage = ({ message }: { message: ConversationMessage }) => {
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
  const [messages, setMessages] = useState<ConversationMessage[]>([]);

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

  useEffect(() => {
    if (sessionTraces.data?.traces) {
      setMessages(sessionTraces.data.traces);
    }
  }, [sessionTraces.data]);

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

  if (!messages.length) {
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
            {messages.length} turn{messages.length === 1 ? "" : "s"}
          </Badge>
          {/* <Badge variant="outline">Session: {sessionId}</Badge> */}
        </div>
      </div>
      {/* Conversation Messages */}
      <div className="grid gap-4 md:px-8">
        {messages.map((message) => (
          <ConversationMessage key={message.id} message={message} />
        ))}
      </div>
    </div>
  );
};
