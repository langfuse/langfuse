import { Codeblock } from "@/src/components/design-system/Codeblock/Codeblock";

export function CopyAgentPromptPanel({
  prompt,
  command,
}: {
  prompt: string;
  command: string;
}) {
  return (
    <div className="ph-no-capture flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="font-bold">Set up with your coding agent</h3>
        <p className="text-muted-foreground text-xs">
          Copy this prompt into Claude, Cursor, Copilot, or another coding
          agent.
        </p>
      </div>
      <div
        role="group"
        aria-label="Setup prompt"
        className="min-w-0 [&_pre]:max-h-24 [&_pre]:break-words [&_pre]:whitespace-pre-wrap"
      >
        <Codeblock
          language="text"
          label="Setup prompt"
          value={prompt}
          variant="read-only"
        />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs">
          Or run in your project directory:
        </p>
        <Codeblock language="bash" value={command} variant="read-only" />
      </div>
    </div>
  );
}
