import { useState, useEffect } from "react";
import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/src/components/ui/sheet";
import { MessageCircle } from "lucide-react";
import { api } from "@/src/utils/api";
import { CommentObjectType } from "@langfuse/shared";

interface CommentSheetProps {
  projectId: string;
  traceId: string;
  currentUserComment?: {
    id: string;
    content: string;
  } | null;
  onCommentSaved: () => void;
  isMobile: boolean;
}

export const CommentSheet = ({
  projectId,
  traceId,
  currentUserComment,
  onCommentSaved,
  isMobile,
}: CommentSheetProps) => {
  const [commentSheetOpen, setCommentSheetOpen] = useState(false);
  const [commentText, setCommentText] = useState("");

  const utils = api.useUtils();

  const createCommentMutation = api.comments.create.useMutation({
    onSuccess: () => {
      utils.comments.getByObjectId.invalidate({
        projectId,
        objectId: traceId,
        objectType: CommentObjectType.TRACE,
      });
      onCommentSaved();
    },
  });

  const deleteCommentMutation = api.comments.delete.useMutation({
    onSuccess: () => {
      utils.comments.getByObjectId.invalidate({
        projectId,
        objectId: traceId,
        objectType: CommentObjectType.TRACE,
      });
      onCommentSaved();
    },
  });

  // Update comment text when currentUserComment changes
  useEffect(() => {
    setCommentText(currentUserComment?.content || "");
  }, [currentUserComment]);

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
          objectId: traceId,
          objectType: CommentObjectType.TRACE,
        });
      }

      await createCommentMutation.mutateAsync({
        projectId,
        objectId: traceId,
        objectType: CommentObjectType.TRACE,
        content: commentText.trim(),
      });

      setCommentSheetOpen(false);
      setCommentText("");
    } catch (error) {
      console.error("Error saving comment:", error);
    }
  };

  // Don't show trigger button if there's already a comment
  if (currentUserComment) {
    return null;
  }

  return (
    <Sheet open={commentSheetOpen} onOpenChange={setCommentSheetOpen}>
      <SheetTrigger asChild>
        <button
          onClick={handleAddComment}
          className="flex gap-2 whitespace-nowrap rounded-full bg-secondary px-2 py-1 text-secondary-foreground transition-all hover:scale-[1.02] hover:bg-secondary/80"
        >
          <MessageCircle className="h-4 w-4 shrink-0" />
        </button>
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
                if (commentText.trim() && !createCommentMutation.isLoading) {
                  handleSaveComment();
                }
              }
            }}
            className="min-h-[120px]"
          />
          <div className="flex gap-2">
            <Button
              onClick={handleSaveComment}
              disabled={!commentText.trim() || createCommentMutation.isLoading}
              className="flex-1"
            >
              {createCommentMutation.isLoading ? "Saving..." : "Save Comment"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
