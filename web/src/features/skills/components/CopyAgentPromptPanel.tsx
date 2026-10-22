import { useState } from "react";
import { Check, Copy } from "@langfuse/icons";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Codeblock } from "@/src/components/design-system/Codeblock/Codeblock";
import { useCopyToClipboard } from "@/src/hooks/useCopyToClipboard";

export function CopyAgentPromptPanel({
  prompt,
  command,
}: {
  prompt: string;
  command: string;
}) {
  const { copy, isCopied } = useCopyToClipboard();
  const [copyError, setCopyError] = useState(false);
  const handleCopyPrompt = async () => {
    setCopyError(false);
    try {
      await copy(prompt);
    } catch {
      setCopyError(true);
    }
  };

  return (
    <div className="ph-no-capture flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="font-bold">Set up with your coding agent</h3>
        <p className="text-muted-foreground text-xs">
          Copy this prompt into Claude, Cursor, Copilot, or another coding
          agent.
        </p>
      </div>
      <div className="bg-muted/50 relative min-w-0 rounded-2xl border p-5 shadow-xs">
        <pre
          tabIndex={0}
          aria-label="Setup prompt"
          className="max-h-24 min-w-0 overflow-y-auto pr-8 font-mono text-xs leading-6 break-words whitespace-pre-wrap"
        >
          {prompt}
        </pre>
        <div className="absolute top-3 right-3">
          <IconButton
            label={isCopied && !copyError ? "Copied" : "Copy prompt"}
            title={isCopied && !copyError ? "Copied" : "Copy prompt"}
            icon={isCopied && !copyError ? Check : Copy}
            variant="ghost"
            size="sm"
            onClick={handleCopyPrompt}
          />
        </div>
      </div>
      {copyError && (
        <p role="alert" className="text-destructive">
          Could not copy the prompt. Please try again.
        </p>
      )}
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs">
          Or run in your project directory:
        </p>
        <Codeblock language="bash" value={command} variant="read-only" />
      </div>
    </div>
  );
}
