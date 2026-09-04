import useLocalStorage from "@/src/components/useLocalStorage";
import { CodeView } from "@/src/components/ui/CodeJsonViewer";
import { MarkdownView } from "@/src/components/ui/MarkdownViewer";
import { renderRichPromptContent } from "@/src/components/ui/PromptReferences";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";

type PromptTextViewMode = "raw" | "markdown";

export const PROMPT_TEXT_VIEW_MODE_STORAGE_KEY = "promptDetailTextViewMode";

export const PromptTextView = ({
  content,
  title,
  renderRichContent = true,
}: {
  content: string;
  title: string;
  renderRichContent?: boolean;
}) => {
  const [viewMode, setViewMode] = useLocalStorage<PromptTextViewMode>(
    PROMPT_TEXT_VIEW_MODE_STORAGE_KEY,
    "raw",
  );

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex justify-end">
        <Tabs
          value={viewMode}
          onValueChange={(value) => setViewMode(value as PromptTextViewMode)}
        >
          <TabsList aria-label="Text prompt view" className="h-auto gap-1">
            <TabsTrigger value="raw" className="h-fit px-2 text-xs">
              Raw
            </TabsTrigger>
            <TabsTrigger value="markdown" className="h-fit px-2 text-xs">
              Markdown
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {viewMode === "markdown" ? (
        <MarkdownView markdown={content} title={title} />
      ) : (
        <CodeView
          content={
            renderRichContent ? renderRichPromptContent(content) : content
          }
          originalContent={content}
          title={title}
        />
      )}
    </div>
  );
};
