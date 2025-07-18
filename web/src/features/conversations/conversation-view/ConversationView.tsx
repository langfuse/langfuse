import { useState, useEffect } from "react";
import { api } from "@/src/utils/api";
import { Card } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { ErrorPage } from "@/src/components/error-page";
import { JsonSkeleton } from "@/src/components/ui/CodeJsonViewer";
import { IOPreview } from "@/src/components/trace/IOPreview";

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
  return (
    <Card className="mb-4 overflow-hidden">
      <div className="space-y-4 p-4">
        {/* Message Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {message.timestamp.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Conversation Messages */}
        <div className="space-y-3">
          {/* Input Message */}
          {message.input && (
            <div className="flex">
              <div className="mr-3 flex-shrink-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                  U
                </div>
              </div>
              <div className="flex-1 space-y-2">
                <div className="text-sm font-medium">User</div>
                <div className="rounded-lg bg-blue-50 p-3">
                  <IOPreview input={message.input} hideIfNull />
                </div>
              </div>
            </div>
          )}

          {/* Output Message */}
          {message.output && (
            <div className="flex">
              <div className="mr-3 flex-shrink-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-600">
                  A
                </div>
              </div>
              <div className="flex-1 space-y-2">
                <div className="text-sm font-medium">Assistant</div>
                <div className="rounded-lg bg-green-50 p-3">
                  <IOPreview output={message.output} hideIfNull />
                </div>
              </div>
            </div>
          )}

          {/* Show message if no input/output */}
          {!message.input && !message.output && (
            <div className="text-sm text-muted-foreground">
              This trace has no input or output messages.
            </div>
          )}
        </div>
      </div>
    </Card>
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
            This session doesn't contain any traces with input/output messages.
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
            {messages.length} message{messages.length === 1 ? "" : "s"}
          </Badge>
          <Badge variant="outline">Session: {sessionId}</Badge>
        </div>
      </div>

      {/* Conversation Messages */}
      <div className="space-y-2">
        {messages.map((message) => (
          <ConversationMessage key={message.id} message={message} />
        ))}
      </div>
    </div>
  );
};
