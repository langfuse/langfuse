import { HoverCard } from "@/src/components/design-system/HoverCard/HoverCard";

type EvaluatorPromptPreviewProps = {
  trigger: React.ComponentProps<typeof HoverCard>["children"];
  previewContent: string;
};

export function EvaluatorPromptPreview(props: EvaluatorPromptPreviewProps) {
  const { trigger, previewContent } = props;

  return (
    <HoverCard
      openDelay={150}
      closeDelay={150}
      placement="bottom-end"
      content={
        <div className="w-[520px] max-w-[85vw] p-3">
          <p className="text-muted-foreground mb-2 text-xs">
            Prompt preview with the first selected observation
          </p>
          <pre className="bg-muted/20 max-h-[320px] overflow-y-auto rounded-md border p-2 text-xs wrap-break-word whitespace-pre-wrap">
            {previewContent}
          </pre>
        </div>
      }
    >
      {trigger}
    </HoverCard>
  );
}
