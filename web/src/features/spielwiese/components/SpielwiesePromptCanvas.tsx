import {
  MessageCirclePlus,
  MoreHorizontal,
  SendHorizonal,
  SmilePlus,
} from "lucide-react";
import { Button } from "../ui/button";
import type { SpielwieseDashboardVM } from "../types/dashboard";

type SpielwiesePromptCanvasProps = {
  promptCanvas: NonNullable<SpielwieseDashboardVM["promptCanvas"]>;
};

function getEditorParagraphs(
  sections: NonNullable<SpielwieseDashboardVM["promptCanvas"]>["sections"],
) {
  return sections.flatMap((section, sectionIndex) => [
    ...section.content.map((line, lineIndex) => ({
      id: `${section.id}-${lineIndex}`,
      text: line,
    })),
    ...(sectionIndex === sections.length - 1
      ? []
      : [{ id: `${section.id}-gap`, text: "" }]),
  ]);
}

function EditorToolbar() {
  return (
    <div className="flex items-center gap-1">
      <Button aria-label="Add reaction" size="icon-sm" variant="ghost">
        <SmilePlus size={16} />
      </Button>
      <Button aria-label="Add comment" size="icon-sm" variant="ghost">
        <MessageCirclePlus size={16} />
      </Button>
      <Button aria-label="Share page" size="icon-sm" variant="ghost">
        <SendHorizonal size={16} />
      </Button>
      <Button aria-label="More options" size="icon-sm" variant="ghost">
        <MoreHorizontal size={16} />
      </Button>
    </div>
  );
}

export function SpielwiesePromptCanvas({
  promptCanvas,
}: SpielwiesePromptCanvasProps) {
  const editorParagraphs = getEditorParagraphs(promptCanvas.sections);

  return (
    <section
      className="@container flex min-h-[calc(100dvh-7rem)] flex-col"
      data-testid="spielwiese-prompt-canvas"
    >
      <div className="flex-1 overflow-y-auto">
        <div
          className="mx-auto flex min-h-full w-full max-w-[48rem] flex-col"
          data-testid="spielwiese-document-editor"
        >
          <div className="flex items-center justify-end px-6 pt-6 sm:px-10 sm:pt-8">
            <div className="shrink-0">
              <EditorToolbar />
            </div>
          </div>

          <div className="flex-1 px-6 pb-10 sm:px-10 sm:pb-14">
            <div
              className="text-foreground min-h-full cursor-text text-base text-pretty [caret-color:currentColor] outline-none sm:text-sm/6 [&>p+p]:mt-2"
              contentEditable
              data-testid="spielwiese-editor-body"
              role="textbox"
              suppressContentEditableWarning
            >
              {editorParagraphs.map((paragraph) => (
                <p className="min-h-7 whitespace-pre-wrap" key={paragraph.id}>
                  {paragraph.text}
                </p>
              ))}
              <p className="min-h-7 whitespace-pre-wrap" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
