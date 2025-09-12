import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { api } from "@/src/utils/api";
import { X, Pen } from "lucide-react";
import { CommentObjectType } from "@langfuse/shared";
import { OMAI_SCORE_CONFIGS, generateScoreName } from "./score-config";
import { getScoreColor } from "./score-colors";
import type { OmaiScoreConfig } from "./score-config";
import { AddScoreButton } from "./AddScoreButton";
import { CommentSheet } from "./CommentSheet";
import { ScoreDeleteDialog, CommentDeleteDialog } from "./ConfirmationDialogs";
import { CreateSnapshotUserButton } from "./CreateSnapshotUserButton";

interface MessageScoresProps {
  id: string;
  projectId: string;
  sessionNumber: string;
  turnNumber: number;
  sessionId: string;
  conversationUserName: string;
}

export const MessageScores = ({
  id,
  projectId,
  sessionNumber,
  turnNumber,
  sessionId,
  conversationUserName,
}: MessageScoresProps) => {
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

  // Track scores that are currently being saved
  const [savingScores, setSavingScores] = useState<string[]>([]);

  // State for deletion modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [scoreToDelete, setScoreToDelete] = useState<{
    scoreValue: string;
    scoreId: string;
    scoreName: string;
  } | null>(null);

  // State for comment deletion confirmation
  const [commentDeleteModalOpen, setCommentDeleteModalOpen] = useState(false);
  const [commentToDelete, setCommentToDelete] = useState<{
    commentId: string;
    content: string;
  } | null>(null);

  // Function to save a new score
  const saveScore = async (scoreValue: string, configId: string) => {
    if (!userName) return;

    // Add to saving state for visual feedback
    setSavingScores((prev) => [...prev, scoreValue]);

    try {
      const scoreName = generateScoreName(
        configId as OmaiScoreConfig["id"],
        userName,
      );

      // Check if there's already an existing score for this config
      const existingScore = existingUserScores.find(
        (s) => s.name === scoreName,
      );

      if (existingScore) {
        // If score exists, append the new value
        const existingValues = existingScore.stringValue
          ? existingScore.stringValue.split(",").map((v) => v.trim())
          : [];
        const newValues = [...existingValues, scoreValue.trim()];

        await mutateScores.mutateAsync({
          projectId,
          traceId: id,
          scoreId: existingScore.id,
          name: scoreName,
          dataType: "CATEGORICAL" as const,
          stringValue: newValues.join(", "),
        });
      } else {
        // Create new score
        await mutateScores.mutateAsync({
          projectId,
          traceId: id,
          name: scoreName,
          dataType: "CATEGORICAL" as const,
          stringValue: scoreValue.trim(),
        });
      }

      // Remove from new scores and saving state since it's now saved
      setNewUserScores((prev) => prev.filter((s) => s !== scoreValue));
      setSavingScores((prev) => prev.filter((s) => s !== scoreValue));
    } catch (error) {
      console.error("Error saving score:", error);
      // Remove from saving state on error but keep in new scores
      setSavingScores((prev) => prev.filter((s) => s !== scoreValue));
    }
  };

  // Get existing score values as individual items
  const existingScoreValues = existingUserScores
    .map((s) => s.stringValue)
    .filter((s): s is string => s !== null && s !== undefined)
    .flatMap((s) => s.split(",").map((item) => item.trim()));

  // Combine existing and new scores for display
  const allUserScores = [...existingScoreValues, ...newUserScores];

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
    return scores.map((scoreValue, index) => {
      const isSaving = savingScores.includes(scoreValue);
      const isNew = isNewScore(scoreValue);

      return (
        <div
          key={`${scoreValue}-${index}`}
          className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs ${
            isSaving
              ? `${getScoreColor(scoreValue)} border-2 border-solid border-blue-500 opacity-75 dark:border-blue-400`
              : isNew
                ? `${getScoreColor(scoreValue)} border-2 border-dashed border-blue-400 dark:border-blue-300`
                : getScoreColor(scoreValue)
          }`}
        >
          <span>{scoreValue}</span>
          {isSaving && (
            <div className="ml-1 h-3 w-3 animate-spin rounded-full border border-gray-400 border-t-blue-500"></div>
          )}
          {showDeleteButton && !isSaving && (
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
      );
    });
  };

  const handleScoreSelect = (scoreValue: string, configId: string) => {
    // Don't add if it already exists (either in existing or new scores)
    if (!allUserScores.includes(scoreValue.trim())) {
      // Add to temporary state first for immediate UI feedback
      setNewUserScores((prev) =>
        Array.from(new Set([...prev, scoreValue.trim()])),
      );
      // Auto-save the score
      saveScore(scoreValue.trim(), configId);
    }
  };

  const handleCommentSaved = () => {
    // This callback can be used to refresh comments or perform other actions
    // The CommentSheet component already handles the API invalidation
  };

  return (
    <div className="">
      <div id="score-buttons" className="flex flex-wrap gap-2">
        {OMAI_SCORE_CONFIGS.map((config) => {
          return (
            <AddScoreButton
              key={config.id}
              {...config}
              allUserScores={allUserScores}
              onScoreSelect={handleScoreSelect}
            />
          );
        })}

        {/* Comment Button */}
        <CommentSheet
          projectId={projectId}
          traceId={id}
          currentUserComment={currentUserComment}
          onCommentSaved={handleCommentSaved}
          isMobile={isMobile}
        />

        {conversationUserName && (
          <>
            {/* Create Snapshot User Button */}
            <CreateSnapshotUserButton
              username={conversationUserName || "Unknown"}
              sessionNumber={sessionNumber}
              turnNumber={turnNumber}
              projectId={projectId}
              traceId={id}
              sessionId={sessionId}
            />
          </>
        )}
      </div>

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
                  (_score) => false, // check if it's a new score
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
                        // Note: Edit functionality would need to be implemented in CommentSheet
                        // For now, this just opens the sheet
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

      {/* Delete Confirmation Modals */}
      <ScoreDeleteDialog
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        scoreValue={scoreToDelete?.scoreValue || null}
        onConfirm={confirmDelete}
        isLoading={deleteScores.isLoading}
      />

      <CommentDeleteDialog
        open={commentDeleteModalOpen}
        onOpenChange={setCommentDeleteModalOpen}
        onConfirm={confirmDeleteComment}
        isLoading={deleteCommentMutation.isLoading}
      />
    </div>
  );
};
