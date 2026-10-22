import { useState } from "react";
import { Button } from "@/src/components/design-system/Button/Button";
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
    <div className="ph-no-capture flex flex-col gap-3">
      <div className="bg-muted/30 flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
        <div className="flex flex-col gap-1">
          <h3 className="font-bold">Set up with your coding agent</h3>
          <p className="text-muted-foreground text-xs">
            Paste this prompt into Claude, Cursor, Copilot, or another coding
            agent.
          </p>
        </div>
        <Button
          text={isCopied && !copyError ? "Copied" : "Copy prompt"}
          onClick={handleCopyPrompt}
        />
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
