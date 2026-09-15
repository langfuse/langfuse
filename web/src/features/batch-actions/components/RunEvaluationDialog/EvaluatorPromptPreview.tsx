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
      <HoverCardContent className="w-[520px] max-w-[85vw]" align="end">
        <p className="text-muted-foreground mb-2 text-xs">
          Prompt preview with the first selected observation
        </p>
        <pre className="bg-muted/20 max-h-[320px] overflow-y-auto rounded-md border p-2 text-xs wrap-break-word whitespace-pre-wrap">
          {previewContent}
        </pre>
      </HoverCardContent>
    </HoverCard>
  );
}
