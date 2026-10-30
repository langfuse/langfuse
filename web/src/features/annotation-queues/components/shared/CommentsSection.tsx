import { CommentList } from "@/src/features/comments";
import { type AnnotationQueueObjectType } from "@langfuse/shared";

interface CommentsSectionProps {
  projectId: string;
  objectId: string;
  objectType: AnnotationQueueObjectType;
  onDraftChange?: (hasDraft: boolean) => void;
}

export const CommentsSection: React.FC<CommentsSectionProps> = ({
  projectId,
  objectId,
  objectType,
  onDraftChange,
}) => {
  return (
    <CommentList
      projectId={projectId}
      objectId={objectId}
      objectType={objectType}
      cardView
      onDraftChange={onDraftChange}
    />
  );
};
