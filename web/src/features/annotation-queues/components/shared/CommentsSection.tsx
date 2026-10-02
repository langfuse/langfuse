import { CommentList } from "@/src/features/comments";
import { useCanReadComments } from "@/src/features/comments/hooks/useCanReadComments";
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
  const canReadComments = useCanReadComments(projectId);
  return (
    <>
      {canReadComments && (
        <CommentList
          projectId={projectId}
          objectId={objectId}
          objectType={objectType}
          cardView
          onDraftChange={onDraftChange}
        />
      )}
    </>
  );
};
