import { useCallback } from "react";
import { PromptType } from "@langfuse/shared";
import { type z } from "zod/v4";
import { ChatMlArraySchema } from "@/src/components/schemas/ChatMlSchema";
import { OpenAiMessageView } from "@/src/components/trace2/components/IOPreview/components/ChatMessageList";
import { CodeView } from "@/src/components/ui/CodeJsonViewer";
import { AdvancedJsonViewer } from "@/src/components/ui/AdvancedJsonViewer/AdvancedJsonViewer";
import { api } from "@/src/utils/api";
import { useCommentedPaths } from "@/src/features/comments/hooks/useCommentedPaths";
import {
  InlineCommentSelectionProvider,
  useInlineCommentSelectionOptional,
} from "@/src/features/comments/contexts/InlineCommentSelectionContext";
import { CommentableJsonView } from "@/src/features/comments/components/CommentableJsonView";
import { InlineCommentBubble } from "@/src/features/comments/components/InlineCommentBubble";
import { type SelectionData } from "@/src/features/comments/contexts/InlineCommentSelectionContext";

interface PromptContentViewerProps {
  promptId: string;
  projectId: string;
  prompt: unknown;
  promptType: PromptType;
  enableInlineComments?: boolean;
  onAddInlineComment?: (selection: SelectionData) => void;
}

function PromptContentViewerInner({
  promptId,
  projectId,
  prompt,
  promptType,
  enableInlineComments = false,
  onAddInlineComment,
}: PromptContentViewerProps) {
  const selectionContext = useInlineCommentSelectionOptional();

  const handleAddComment = useCallback(() => {
    if (selectionContext?.selection && onAddInlineComment) {
      onAddInlineComment(selectionContext.selection);
    }
  }, [selectionContext?.selection, onAddInlineComment]);

  // Fetch existing comments
  const comments = api.comments.getByObjectId.useQuery({
    projectId,
    objectId: promptId,
    objectType: "PROMPT",
  });

  // Build commented paths map
  const commentedPathsByField = useCommentedPaths(comments.data);

  // Parse chat messages if chat type
  let chatMessages: z.infer<typeof ChatMlArraySchema> | null = null;
  try {
    chatMessages = ChatMlArraySchema.parse(prompt);
  } catch (error) {
    if (promptType === PromptType.Chat) {
      console.warn("Could not parse chat prompt", error);
    }
  }

  // Render based on prompt type
  return (
    <div className="flex flex-col gap-2">
      {/* Inline comment bubble - shows when text is selected */}
      {enableInlineComments && (
        <InlineCommentBubble onAddComment={handleAddComment} />
      )}

      {/* Prompt section */}
      <CommentableJsonView enabled={enableInlineComments}>
        {promptType === PromptType.Chat && chatMessages ? (
          <OpenAiMessageView
            messages={chatMessages}
            shouldRenderMarkdown={true}
            currentView="pretty"
            messageToToolCallNumbers={new Map()}
            collapseLongHistory={false}
            projectIdForPromptButtons={projectId}
            enableInlineComments={enableInlineComments}
            sectionKey="prompt"
            commentedPathsByField={commentedPathsByField}
          />
        ) : typeof prompt === "string" ? (
          <CodeView
            content={prompt}
            originalContent={prompt}
            title="Text Prompt"
            enableInlineComments={enableInlineComments}
            sectionKey="prompt"
            commentedRanges={commentedPathsByField?.prompt?.get("$")}
          />
        ) : (
          <AdvancedJsonViewer
            data={prompt}
            field="prompt"
            title="Prompt"
            commentedPathsByField={commentedPathsByField}
          />
        )}
      </CommentableJsonView>
    </div>
  );
}

/**
 * PromptContentViewer - Wrapper that conditionally adds InlineCommentSelectionProvider.
 */
export function PromptContentViewer(props: PromptContentViewerProps) {
  // Wrap with selection provider if inline comments are enabled
  if (props.enableInlineComments) {
    return (
      <InlineCommentSelectionProvider>
        <PromptContentViewerInner {...props} />
      </InlineCommentSelectionProvider>
    );
  }
  return <PromptContentViewerInner {...props} />;
}
