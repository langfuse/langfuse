import { MarkdownJsonViewHeader } from "@/src/components/ui/MarkdownJsonView";
import { cn } from "@/src/utils/tailwind";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import {
  getStatusMessagePresentation,
  type ObservationStatusMessage,
} from "./statusMessagePresentation";

export function StatusMessageSection({
  status,
}: {
  status: ObservationStatusMessage;
}) {
  const presentation = getStatusMessagePresentation(status.level);

  return (
    <div className="[&_.io-message-header]:px-2">
      <MarkdownJsonViewHeader
        title={presentation.title}
        handleOnValueChange={() => undefined}
        handleOnCopy={() => copyTextToClipboard(status.message)}
        canEnableMarkdown={false}
      />
      <div
        className={cn(
          "ph-no-capture mx-2 rounded-sm border px-2 py-2 text-xs wrap-break-word whitespace-pre-wrap",
          presentation.className,
        )}
      >
        {status.message}
      </div>
    </div>
  );
}
