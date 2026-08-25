import { MarkdownJsonViewHeader } from "@/src/components/ui/MarkdownJsonView";
import { copyTextToClipboard } from "@/src/utils/clipboard";

export function ErrorSection({ message }: { message: string }) {
  return (
    <div className="[&_.io-message-header]:px-2">
      <MarkdownJsonViewHeader
        title="Error"
        handleOnValueChange={() => undefined}
        handleOnCopy={() => copyTextToClipboard(message)}
        canEnableMarkdown={false}
      />
      <div
        className="border-dark-red bg-light-red ph-no-capture mx-2 rounded-sm border px-2 py-2 text-xs wrap-break-word whitespace-pre-wrap"
        data-testid="observation-error-section-content"
      >
        {message}
      </div>
    </div>
  );
}
