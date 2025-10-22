import {
  OpenAIContentSchema,
  type OpenAIOutputAudioType,
} from "@/src/components/schemas/ChatMlSchema";
import { StringOrMarkdownSchema } from "@/src/components/schemas/MarkdownSchema";
import { Button } from "@/src/components/ui/button";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { MarkdownView } from "@/src/components/ui/MarkdownViewer";
import { type MediaReturnType } from "@/src/features/media/validation";
import { Check, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { type z } from "zod/v4";
import { MARKDOWN_RENDER_CHARACTER_LIMIT } from "@/src/utils/constants";

type MarkdownJsonViewHeaderProps = {
  title: string;
  handleOnValueChange: () => void;
  handleOnCopy: (event?: React.MouseEvent<HTMLButtonElement>) => void;
  canEnableMarkdown?: boolean;
  controlButtons?: React.ReactNode;
};

export function MarkdownJsonViewHeader({
  title,
  handleOnValueChange: _handleOnValueChange,
  handleOnCopy,
  canEnableMarkdown: _canEnableMarkdown = true,
  controlButtons,
}: MarkdownJsonViewHeaderProps) {
  const [isCopied, setIsCopied] = useState(false);

  return (
    <div className="flex flex-row items-center justify-between px-1 py-1 text-sm font-medium capitalize">
      {title}
      <div className="mr-1 flex min-w-0 flex-shrink flex-row items-center gap-1">
        {controlButtons}
        <Button
          title="Copy to clipboard"
          variant="ghost"
          size="icon-xs"
          type="button"
          onClick={(event) => {
            setIsCopied(true);
            handleOnCopy(event);
            setTimeout(() => setIsCopied(false), 1000);
          }}
          className="-mr-2 hover:bg-border"
        >
          {isCopied ? (
            <Check className="h-3 w-3" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </Button>
      </div>
    </div>
  );
}

const isSupportedMarkdownFormat = (
  content: unknown,
  contentValidation: z.ZodSafeParseResult<z.infer<typeof OpenAIContentSchema>>,
): content is z.infer<typeof OpenAIContentSchema> => {
  if (!contentValidation.success) return false;

  // Don't render if markdown content is huge
  const contentSize = JSON.stringify(content || {}).length;
  if (contentSize > MARKDOWN_RENDER_CHARACTER_LIMIT) {
    return false;
  }

  return true;
};

// MarkdownJsonView will render markdown if `isMarkdownEnabled` (global context) is true and the content is valid markdown
// otherwise, if content is valid markdown will render JSON with switch to enable markdown globally
export function MarkdownJsonView({
  content,
  title,
  className,
  customCodeHeaderClassName,
  audio,
  media,
}: {
  content?: unknown;
  title?: string;
  className?: string;
  customCodeHeaderClassName?: string;
  audio?: OpenAIOutputAudioType;
  media?: MediaReturnType[];
}) {
  const stringOrValidatedMarkdown = useMemo(
    () => StringOrMarkdownSchema.safeParse(content),
    [content],
  );
  const validatedOpenAIContent = useMemo(
    () => OpenAIContentSchema.safeParse(content),
    [content],
  );

  const canEnableMarkdown = isSupportedMarkdownFormat(
    content,
    validatedOpenAIContent,
  );

  return (
    <>
      {canEnableMarkdown ? (
        <MarkdownView
          markdown={stringOrValidatedMarkdown.data ?? content}
          title={title}
          customCodeHeaderClassName={customCodeHeaderClassName}
          audio={audio}
          media={media}
        />
      ) : (
        <PrettyJsonView
          json={content ?? (audio ? { audio } : null)}
          title={title}
          className={className}
          media={media}
          currentView="pretty"
        />
      )}
    </>
  );
}
