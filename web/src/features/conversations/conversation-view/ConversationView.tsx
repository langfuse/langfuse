import { useState, useEffect } from "react";
import { api } from "@/src/utils/api";
import { Card } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { ErrorPage } from "@/src/components/error-page";
import { JsonSkeleton } from "@/src/components/ui/CodeJsonViewer";
// import { IOPreview } from "@/src/components/trace/IOPreview";
import { Avatar, AvatarFallback } from "@/src/components/ui/avatar";
import { UserIcon, SparkleIcon, PlusIcon } from "lucide-react";
import { MarkdownJsonView } from "@/src/components/ui/MarkdownJsonView";
import { deepParseJson } from "@langfuse/shared";
import { BotIcon } from "lucide-react";
import { generateScoreName, OMAI_SCORE_CONFIGS } from "./score-config";
import { MultiSelect } from "@/src/features/filters/components/multi-select";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/src/components/ui/select";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { useSession } from "next-auth/react";

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
        <div className="grid max-w-screen-sm gap-2">
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
          <div>
            <div className="grid max-w-screen-sm gap-2">
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
          </div>
          <div id="scores-container" className="flex-1 py-4">
            <div className="text-sm font-bold">Scores</div>
            <div id="inner-container" className="pt-2">
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
  const utils = api.useUtils();

  const session = useSession();

  const userName = session.data?.user?.name?.split(" ")[0];

  const scoresQuery = api.conversation.getScoresForTraces.useQuery({
    projectId,
    traceIds: [id],
  });

  const mutateScores = api.conversation.upsertScore.useMutation({
    onSuccess: () => {
      console.log("Invalidating scores query");
      utils.conversation.getScoresForTraces.invalidate({
        projectId,
        traceIds: [id],
      });
    },
  });

  // sync with scores query
  const [userScores, setUserScores] = useState<string[]>([]);

  function AddScoreButton(props: (typeof OMAI_SCORE_CONFIGS)[number]) {
    return (
      <Popover>
        <PopoverTrigger>
          <button
            key={props.id}
            className="flex gap-2 whitespace-nowrap rounded-full bg-secondary px-2 py-1 text-secondary-foreground transition-all hover:scale-[1.02] hover:bg-secondary/80"
          >
            <div className="line-clamp-1 text-xs text-muted-foreground">
              {props.label}
            </div>
            <PlusIcon className="h-4 w-4 shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          sideOffset={6}
          align="start"
          className="p-0"
        >
          <div className="grid">
            {props.options.map((option) => {
              return (
                <PopoverClose asChild>
                  <button
                    className="bg-secondary/40 px-2 py-2 text-left text-xs text-secondary-foreground hover:bg-secondary"
                    key={option}
                    onClick={() => {
                      setUserScores((prev) =>
                        Array.from(new Set([...prev, option])),
                      );
                    }}
                  >
                    {option}
                  </button>
                </PopoverClose>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div className="">
      <div id="score-buttons" className="flex flex-wrap gap-2">
        {OMAI_SCORE_CONFIGS.map((config) => {
          return <AddScoreButton key={config.id} {...config} />;
        })}
      </div>
      <div id="score-display" className="pt-3">
        <div id="user-scores-todo-map">
          <div className="text-sm">{userName}:</div>
        </div>
      </div>
    </div>
  );
}

/**

backup

 <div className="grid min-h-56 gap-4">
      {OMAI_SCORE_CONFIGS.map((config) => {
        return (
          <div className="border border-dashed p-2">
            <div className="font-mono">{config.reviewer}</div>
            <div className="grid gap-2 pt-4">
              {config.options.map((option) => {
                // find score for this reviewer
                const targetScoreName = generateScoreName(config, option.id);

                const existingScore = scoresQuery.data?.scores.find(
                  (score) =>
                    score.name === targetScoreName &&
                    score.traceId === id &&
                    score.source === "ANNOTATION",
                );

                const scoreValue =
                  existingScore?.stringValue?.split(",").filter(Boolean) ?? [];

                return (
                  <div className="flex flex-wrap items-center gap-4 rounded bg-secondary p-2">
                    <div className="text-sm">{option.label}:</div>
                    <MultiSelect
                      values={scoreValue}
                      onValueChange={(newValue) => {
                        const preparedValue = newValue.join(",");
                        mutateScores.mutate({
                          projectId,
                          scoreId: existingScore?.id ?? undefined,
                          traceId: id,
                          name: targetScoreName,
                          dataType: "CATEGORICAL",
                          stringValue: preparedValue,
                        });
                      }}
                      options={option.options.map((option) => ({
                        value: option,
                        displayValue: option,
                      }))}
                      label="Select options"
                      className="min-w-[200px]"
                      disabled={mutateScores.isLoading || scoresQuery.isLoading}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>


*/
