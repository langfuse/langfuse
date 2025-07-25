import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/src/components/ui/accordion";
import { CommentList } from "@/src/features/comments/CommentList";
import { type AnnotationQueueObjectType } from "@langfuse/shared";

interface CommentsSectionProps {
  projectId: string;
  objectId: string;
  objectType: AnnotationQueueObjectType;
  showComments: boolean;
  onToggleComments: (show: boolean) => void;
}

export const CommentsSection: React.FC<CommentsSectionProps> = ({
  projectId,
  objectId,
  objectType,
  showComments,
  onToggleComments,
}) => {
  return (
    <Accordion
      type="single"
      collapsible
      className="mx-4 mt-4"
      value={showComments ? "item-1" : ""}
      onValueChange={(value) => onToggleComments(value === "item-1")}
    >
      <AccordionItem value="item-1" className="border-none">
        <div className="sticky top-0 z-10 border-b bg-background">
          <AccordionTrigger onClick={() => onToggleComments(!showComments)}>
            Comments
          </AccordionTrigger>
        </div>
        <AccordionContent>
          <CommentList
            projectId={projectId}
            objectId={objectId}
            objectType={objectType}
            className="rounded-t-none border-t-transparent"
            cardView
          />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};
