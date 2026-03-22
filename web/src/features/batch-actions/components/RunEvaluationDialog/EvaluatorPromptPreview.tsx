import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";

type EvaluatorPromptPreviewProps = {
  trigger: React.ReactNode;
  previewContent: string;
};

export function EvaluatorPromptPreview(props: EvaluatorPromptPreviewProps) {
  const { trigger, previewContent } = props;

  return (
    <HoverCard openDelay={150} closeDelay={150}>
      <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
      <HoverCardContent
        className="z-50 w-[520px] max-w-[85vw]"
        align="end"
        onWheel={(event) => event.stopPropagation()}
      >
        <p className="text-muted-foreground mb-2 text-xs">
          Prompt preview with the first selected observation
        </p>
        <pre
          className="bg-muted/20 wrap-break-word max-h-[320px] overflow-y-auto whitespace-pre-wrap rounded-md border p-2 text-xs"
          onWheel={(event) => event.stopPropagation()}
        >
          {previewContent}
        </pre>
      </HoverCardContent>
    </HoverCard>
  );
}
