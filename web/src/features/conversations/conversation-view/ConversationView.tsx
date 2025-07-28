import { useState } from "react";
import { api } from "@/src/utils/api";
import { Card } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { ErrorPage } from "@/src/components/error-page";
import { JsonSkeleton } from "@/src/components/ui/CodeJsonViewer";
// import { IOPreview } from "@/src/components/trace/IOPreview";
import { Avatar, AvatarFallback } from "@/src/components/ui/avatar";
import { UserIcon, SparkleIcon, PlusIcon, X } from "lucide-react";
import { MarkdownJsonView } from "@/src/components/ui/MarkdownJsonView";
import { deepParseJson } from "@langfuse/shared";
import { generateScoreName, OMAI_SCORE_CONFIGS } from "./score-config";
import { getScoreColor } from "./score-colors";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
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

  const currentUserId = session.data?.user?.id;
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

  const deleteScores = api.conversation.deleteScore.useMutation({
    onSuccess: () => {
      utils.conversation.getScoresForTraces.invalidate({
        projectId,
        traceIds: [id],
      });
    },
  });

  // Get existing scores for current user
  const existingUserScores =
    scoresQuery.data?.scores.filter((s) => s.authorUserId === currentUserId) ??
    [];

  // Track new scores that haven't been saved yet
  const [newUserScores, setNewUserScores] = useState<string[]>([]);

  // State for deletion modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [scoreToDelete, setScoreToDelete] = useState<{
    scoreValue: string;
    scoreId: string;
    scoreName: string;
  } | null>(null);

  // Get existing score values as individual items
  const existingScoreValues = existingUserScores
    .map((s) => s.stringValue)
    .filter((s): s is string => s !== null && s !== undefined)
    .flatMap((s) => s.split(",").map((item) => item.trim()));

  // Combine existing and new scores for display
  const allUserScores = [...existingScoreValues, ...newUserScores];

  const hasUnsavedChanges = newUserScores.length > 0;

  const handleSave = async () => {
    if (!currentUserId || !userName) return;

    // Group new scores by their config
    const scoresByConfig = new Map<string, string[]>();

    newUserScores.forEach((scoreValue) => {
      const config = OMAI_SCORE_CONFIGS.find((c) =>
        c.options.includes(scoreValue),
      );
      if (config) {
        if (!scoresByConfig.has(config.id)) {
          scoresByConfig.set(config.id, []);
        }
        scoresByConfig.get(config.id)!.push(scoreValue);
      }
    });

    const promises = Array.from(scoresByConfig.entries()).map(
      async ([configId, scoreValues]) => {
        const config = OMAI_SCORE_CONFIGS.find((c) => c.id === configId);
        if (!config) return;

        const targetScoreName = generateScoreName(configId, userName);

        // Check if score already exists
        const existingScore = existingUserScores.find(
          (s) => s.name === targetScoreName,
        );

        // Get existing values and append new ones
        const existingValues = existingScore?.stringValue
          ? existingScore.stringValue.split(",").map((s) => s.trim())
          : [];

        const allValues = [...new Set([...existingValues, ...scoreValues])];
        const combinedStringValue = allValues.join(", ");

        return mutateScores.mutateAsync({
          projectId,
          traceId: id,
          scoreId: existingScore?.id ?? undefined,
          name: targetScoreName,
          dataType: "CATEGORICAL" as const,
          stringValue: combinedStringValue,
        });
      },
    );

    await Promise.all(promises);
    setNewUserScores([]); // Clear new scores after saving
  };

  const handleReset = () => {
    setNewUserScores([]); // Clear new scores
  };

  const handleDeleteScore = (scoreValue: string) => {
    // Find the existing score that contains this value
    const existingScore = existingUserScores.find((s) =>
      s.stringValue?.includes(scoreValue),
    );

    if (existingScore) {
      setScoreToDelete({
        scoreValue,
        scoreId: existingScore.id,
        scoreName: existingScore.name,
      });
      setDeleteModalOpen(true);
    } else {
      // If it's a new score, just remove it from the new scores
      setNewUserScores((prev) => prev.filter((s) => s !== scoreValue));
    }
  };

  const confirmDelete = async () => {
    if (!scoreToDelete) return;

    try {
      // Remove the specific value from the existing score
      const existingScore = existingUserScores.find(
        (s) => s.id === scoreToDelete.scoreId,
      );
      if (existingScore?.stringValue) {
        const remainingValues = existingScore.stringValue
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s !== scoreToDelete.scoreValue);

        if (remainingValues.length === 0) {
          // If no values left, delete the entire score
          await deleteScores.mutateAsync({
            projectId,
            scoreId: scoreToDelete.scoreId,
          });
        } else {
          // Update the score with remaining values
          await mutateScores.mutateAsync({
            projectId,
            traceId: id,
            scoreId: scoreToDelete.scoreId,
            name: scoreToDelete.scoreName,
            dataType: "CATEGORICAL" as const,
            stringValue: remainingValues.join(", "),
          });
        }
      }
    } catch (error) {
      console.error("Error deleting score:", error);
    } finally {
      setDeleteModalOpen(false);
      setScoreToDelete(null);
    }
  };

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
                <PopoverClose asChild key={option}>
                  <button
                    className={`px-2 py-2 text-left text-xs hover:bg-secondary ${
                      allUserScores.includes(option)
                        ? "cursor-not-allowed bg-secondary/60 text-muted-foreground"
                        : "bg-secondary/40 text-secondary-foreground"
                    }`}
                    disabled={allUserScores.includes(option)}
                    onClick={() => {
                      // Don't add if it already exists (either in existing or new scores)
                      if (!allUserScores.includes(option)) {
                        setNewUserScores((prev) =>
                          Array.from(new Set([...prev, option])),
                        );
                      }
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

      {hasUnsavedChanges && (
        <div className="flex gap-2 pt-2">
          <button
            disabled={mutateScores.isLoading}
            onClick={handleReset}
            className="rounded-md border px-3 py-1 text-sm hover:bg-secondary/80"
          >
            Reset
          </button>
          <button
            disabled={mutateScores.isLoading}
            onClick={handleSave}
            className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground hover:bg-primary/90"
          >
            Save
          </button>
        </div>
      )}

      <div id="score-display" className="pt-3">
        {allUserScores.length > 0 && (
          <div id="user-scores-todo-map">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-medium">{userName}:</div>
              {allUserScores.map((scoreValue, index) => (
                <div
                  key={`${scoreValue}-${index}`}
                  className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs ${
                    newUserScores.includes(scoreValue)
                      ? `${getScoreColor(scoreValue)} border-2 border-dashed border-blue-400 dark:border-blue-300`
                      : getScoreColor(scoreValue)
                  }`}
                >
                  <span>{scoreValue}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteScore(scoreValue);
                    }}
                    className="ml-1 rounded-full p-0.5 transition-colors hover:bg-black/20 dark:hover:bg-white/20"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Score</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the score &quot;
              {scoreToDelete?.scoreValue}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteModalOpen(false)}
              disabled={deleteScores.isLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteScores.isLoading}
            >
              {deleteScores.isLoading ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
