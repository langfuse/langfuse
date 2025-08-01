import { useState, useEffect, useMemo } from "react";
import { api } from "@/src/utils/api";
import { Card } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { ErrorPage } from "@/src/components/error-page";
import { JsonSkeleton } from "@/src/components/ui/CodeJsonViewer";
// import { IOPreview } from "@/src/components/trace/IOPreview";
import { Avatar, AvatarFallback } from "@/src/components/ui/avatar";
import {
  UserIcon,
  SparkleIcon,
  X,
  MessageCircle,
  Pen,
  CircleArrowDown,
} from "lucide-react";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/src/components/ui/sheet";
import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import { useSession } from "next-auth/react";
import { CommentObjectType } from "@langfuse/shared";
import { StringOrMarkdownSchema } from "@/src/components/schemas/MarkdownSchema";
import { DjbView } from "@/src/components/ui/DjbView";
import { CreateSnapshotUserButton } from "./CreateSnapshotUserButton";

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
  metadata: string | null;
  tags: string[];
  environment: string | null;
}

const ConversationMessage = ({
  message,
  projectId,
  sessionNumber,
  turnNumber,
  sessionId,
}: {
  message: ConversationMessage;
  projectId: string;
  sessionNumber: string;
  turnNumber: number;
  sessionId: string;
}) => {
  const input = deepParseJson(message.input);
  const output = deepParseJson(message.output);

  const stringOrValidatedMarkdownOutput = useMemo(
    () => StringOrMarkdownSchema.safeParse(output),
    [output],
  );

  const stringOrValidatedMarkdownInput = useMemo(
    () => StringOrMarkdownSchema.safeParse(input),
    [input],
  );

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
            <div className="text-xs text-muted-foreground">
              {message.timestamp.toLocaleString()}
            </div>
          </div>
          <div className="relative overflow-hidden rounded-lg bg-secondary p-2 pb-4 text-sm">
            <DjbView
              title="Input"
              markdown={stringOrValidatedMarkdownInput.data as string}
              customCodeHeaderClassName="bg-secondary"
              media={[]}
            />
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
                <div className="text-xs text-muted-foreground">
                  {message.timestamp.toLocaleString()}
                </div>
              </div>
              <div className="relative overflow-hidden rounded-lg bg-secondary p-2 pb-4 text-sm">
                <DjbView
                  markdown={stringOrValidatedMarkdownOutput.data as string}
                  title="Output"
                  customCodeHeaderClassName=""
                />
              </div>
            </div>
          </div>
          <div id="scores-container" className="flex-1 py-4">
            <div className="text-sm font-bold">Scores</div>
            <div id="inner-container" className="pt-2">
              <MessageScores
                id={message.id}
                projectId={projectId}
                sessionNumber={sessionNumber}
                turnNumber={turnNumber}
                sessionId={sessionId}
              />
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
          messages.map((message, index) => (
            <ConversationMessage
              key={message.id}
              message={message}
              projectId={projectId}
              sessionNumber={(() => {
                const match = sessionId.match(/Session(\d+)/);
                return match ? `${parseInt(match[1])}` : sessionId;
              })()}
              turnNumber={index + 1}
              sessionId={sessionId}
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

function MessageScores({
  id,
  projectId,
  sessionNumber,
  turnNumber,
  sessionId,
}: {
  id: string;
  projectId: string;
  sessionNumber: string;
  turnNumber: number;
  sessionId: string;
}) {
  const utils = api.useUtils();

  const session = useSession();

  const currentUserId = session.data?.user?.id;
  const userName = session.data?.user?.name?.split(" ")[0];

  // Mobile detection hook
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const scoresQuery = api.conversation.getScoresForTraces.useQuery({
    projectId,
    traceIds: [id],
  });

  // Comments functionality
  const commentsQuery = api.comments.getByObjectId.useQuery({
    projectId,
    objectId: id,
    objectType: CommentObjectType.TRACE,
  });

  const createCommentMutation = api.comments.create.useMutation({
    onSuccess: () => {
      utils.comments.getByObjectId.invalidate({
        projectId,
        objectId: id,
        objectType: CommentObjectType.TRACE,
      });
    },
  });

  const deleteCommentMutation = api.comments.delete.useMutation({
    onSuccess: () => {
      utils.comments.getByObjectId.invalidate({
        projectId,
        objectId: id,
        objectType: CommentObjectType.TRACE,
      });
    },
  });

  // Get current user's comment
  const currentUserComment = commentsQuery.data?.find(
    (comment) => comment.authorUserId === currentUserId,
  );

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

  // Get existing scores for other users (only those that match OMAI config patterns)
  const otherUsersScores =
    scoresQuery.data?.scores.filter((s) => {
      if (s.authorUserId === currentUserId) return false;

      // Check if the score name matches the pattern username:configId
      const scoreNameParts = s.name?.split(":");
      if (!scoreNameParts || scoreNameParts.length !== 2) return false;

      // Check if the configId exists in our OMAI configs
      const configId = scoreNameParts[1];
      return OMAI_SCORE_CONFIGS.some((config) => config.id === configId);
    }) ?? [];

  // Track new scores that haven't been saved yet
  const [newUserScores, setNewUserScores] = useState<string[]>([]);

  useEffect(() => {
    if (!newUserScores.length) {
      return;
    }

    handleSave();
  }, [newUserScores]);

  // State for deletion modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [scoreToDelete, setScoreToDelete] = useState<{
    scoreValue: string;
    scoreId: string;
    scoreName: string;
  } | null>(null);

  // State for comment sheet
  const [commentSheetOpen, setCommentSheetOpen] = useState(false);
  const [commentText, setCommentText] = useState("");

  // State for comment deletion confirmation
  const [commentDeleteModalOpen, setCommentDeleteModalOpen] = useState(false);
  const [commentToDelete, setCommentToDelete] = useState<{
    commentId: string;
    content: string;
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

        const allValues = [
          ...new Set([...existingValues, ...scoreValues.map((s) => s.trim())]),
        ];
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

  // Comment handlers
  const handleAddComment = () => {
    setCommentText(currentUserComment?.content || "");
    setCommentSheetOpen(true);
  };

  const handleSaveComment = async () => {
    if (!commentText.trim()) return;

    try {
      if (currentUserComment) {
        // Update existing comment - for now we'll delete and recreate
        await deleteCommentMutation.mutateAsync({
          commentId: currentUserComment.id,
          projectId,
          objectId: id,
          objectType: CommentObjectType.TRACE,
        });
      }

      await createCommentMutation.mutateAsync({
        projectId,
        objectId: id,
        objectType: CommentObjectType.TRACE,
        content: commentText.trim(),
      });

      setCommentSheetOpen(false);
      setCommentText("");
    } catch (error) {
      console.error("Error saving comment:", error);
    }
  };

  const handleDeleteCommentClick = (commentId: string, content: string) => {
    setCommentToDelete({ commentId, content });
    setCommentDeleteModalOpen(true);
  };

  const confirmDeleteComment = async () => {
    if (!commentToDelete) return;

    try {
      await deleteCommentMutation.mutateAsync({
        commentId: commentToDelete.commentId,
        projectId,
        objectId: id,
        objectType: CommentObjectType.TRACE,
      });
    } catch (error) {
      console.error("Error deleting comment:", error);
    } finally {
      setCommentDeleteModalOpen(false);
      setCommentToDelete(null);
    }
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
          .filter((s) => s.trim() !== scoreToDelete.scoreValue.trim());

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

  // Helper function to render score pills
  const renderScorePills = (
    scores: string[],
    showDeleteButton: boolean = false,
    isNewScore: (score: string) => boolean = () => false,
  ) => {
    return scores.map((scoreValue, index) => (
      <div
        key={`${scoreValue}-${index}`}
        className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs ${
          isNewScore(scoreValue)
            ? `${getScoreColor(scoreValue)} border-2 border-dashed border-blue-400 dark:border-blue-300`
            : getScoreColor(scoreValue)
        }`}
      >
        <span>{scoreValue}</span>
        {showDeleteButton && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteScore(scoreValue);
            }}
            className="ml-1 rounded-full p-0.5 transition-colors hover:bg-black/20 dark:hover:bg-white/20"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    ));
  };

  function AddScoreButton(props: (typeof OMAI_SCORE_CONFIGS)[number]) {
    return (
      <Popover>
        <PopoverTrigger>
          <button
            key={props.id}
            className="flex gap-2 whitespace-nowrap rounded-full bg-secondary px-2 py-1 text-secondary-foreground transition-all hover:scale-[1.02] hover:bg-secondary/80"
          >
            <CircleArrowDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="line-clamp-1 text-xs text-muted-foreground">
              {props.label}
            </div>
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
                    disabled={allUserScores.includes(option.trim())}
                    onClick={() => {
                      // Don't add if it already exists (either in existing or new scores)
                      if (!allUserScores.includes(option.trim())) {
                        setNewUserScores((prev) =>
                          Array.from(new Set([...prev, option.trim()])),
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

        {/* Comment Button */}
        <Sheet open={commentSheetOpen} onOpenChange={setCommentSheetOpen}>
          <SheetTrigger asChild>
            {!currentUserComment && (
              <button
                onClick={handleAddComment}
                className="flex gap-2 whitespace-nowrap rounded-full bg-secondary px-2 py-1 text-secondary-foreground transition-all hover:scale-[1.02] hover:bg-secondary/80"
              >
                <MessageCircle className="h-4 w-4 shrink-0" />
              </button>
            )}
          </SheetTrigger>
          <SheetContent
            side={isMobile ? "bottom" : "right"}
            className={isMobile ? "h-[50vh]" : ""}
          >
            <SheetHeader>
              <SheetTitle>
                {currentUserComment ? "Edit Comment" : "Add Comment"}
              </SheetTitle>
              <SheetDescription>
                Add a comment to this trace. You can only have one comment per
                trace.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-6 space-y-4">
              <Textarea
                placeholder="Enter your comment..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    if (
                      commentText.trim() &&
                      !createCommentMutation.isLoading
                    ) {
                      handleSaveComment();
                    }
                  }
                }}
                className="min-h-[120px]"
              />
              <div className="flex gap-2">
                <Button
                  onClick={handleSaveComment}
                  disabled={
                    !commentText.trim() || createCommentMutation.isLoading
                  }
                  className="flex-1"
                >
                  {createCommentMutation.isLoading
                    ? "Saving..."
                    : "Save Comment"}
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
        {userName && (
          <>
            {/* Create Snapshot User Button */}
            <CreateSnapshotUserButton
              username={userName || "Unknown"}
              sessionNumber={sessionNumber}
              turnNumber={turnNumber}
              projectId={projectId}
              traceId={id}
              sessionId={sessionId}
            />
          </>
        )}
      </div>

      {/* {hasUnsavedChanges && (
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
      )} */}

      <div id="score-display" className="space-y-3 pt-3">
        {/* Current user scores and comments */}
        {(allUserScores.length > 0 ||
          (commentsQuery.data &&
            commentsQuery.data.some(
              (c) => c.authorUserId === currentUserId,
            ))) && (
          <div id="user-scores-todo-map" className="rounded-md border p-2">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-bold text-sm font-medium">{userName}</div>
                {renderScorePills(
                  allUserScores,
                  true, // show delete button for current user
                  // always display as existing score since we auto-save
                  (score) => false, // check if it's a new score
                )}
              </div>
              {/* Current user's comment */}
              {commentsQuery.data?.map((comment) => {
                if (comment.authorUserId !== currentUserId) return null;
                return (
                  <div
                    key={comment.id}
                    className="relative rounded-md border bg-secondary/50 p-2"
                  >
                    <div className="pr-8 text-sm text-foreground">
                      {comment.content}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddComment();
                        // setCommentSheetOpen(true);
                        // handleDeleteCommentClick(comment.id, comment.content);
                      }}
                      className="absolute right-7 top-2 rounded-full p-1 transition-colors hover:bg-secondary"
                      disabled={deleteCommentMutation.isLoading}
                      title="Edit comment"
                    >
                      <Pen className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCommentClick(comment.id, comment.content);
                      }}
                      className="absolute right-2 top-2 rounded-full p-1 transition-colors hover:bg-secondary"
                      disabled={deleteCommentMutation.isLoading}
                      title="Delete comment"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Other users' scores and comments (grouped) */}
        {(() => {
          if (!commentsQuery.data && otherUsersScores.length === 0) return null;
          // Get all unique usernames from scores and comments (excluding current user)
          const usernames = Array.from(
            new Set(
              [
                ...otherUsersScores.map((s) => s.name?.split(":")[0]),
                ...(commentsQuery.data || [])
                  .filter(
                    (c) =>
                      c.authorUserId !== currentUserId &&
                      c.authorUserId !== null,
                  )
                  .map((c) => c.authorUserName?.split(" ")[0]),
              ].filter(Boolean),
            ),
          );
          return usernames.length === 0 ? null : (
            <div id="other-users-grouped">
              {usernames.map((username) => {
                // Scores for this user
                const userScores = otherUsersScores.filter(
                  (s) => s.name?.split(":")[0] === username,
                );
                const userScoreValues = userScores
                  .map((s) => s.stringValue)
                  .filter((s): s is string => s !== null && s !== undefined)
                  .flatMap((s) => s.split(",").map((item) => item.trim()));
                // Comment for this user
                const userComment = (commentsQuery.data || []).find(
                  (c) =>
                    c.authorUserName?.split(" ")[0] === username &&
                    c.authorUserId !== currentUserId &&
                    c.authorUserId !== null,
                );
                return (
                  <div
                    key={username}
                    className="mt-2 flex flex-col gap-2 rounded-md border p-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-medium">{username}</div>
                      {renderScorePills(userScoreValues, false)}
                    </div>
                    {userComment && (
                      <div className="relative rounded-md border bg-secondary/50 p-2">
                        <div className="pr-8 text-sm text-foreground">
                          {userComment.content}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Delete Confirmation Modal */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Score</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the score &quot;
              {scoreToDelete?.scoreValue}&quot;?{" "}
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

      {/* Comment Delete Confirmation Modal */}
      <Dialog
        open={commentDeleteModalOpen}
        onOpenChange={setCommentDeleteModalOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Comment</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this comment?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCommentDeleteModalOpen(false)}
              disabled={deleteCommentMutation.isLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteComment}
              disabled={deleteCommentMutation.isLoading}
            >
              {deleteCommentMutation.isLoading ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
