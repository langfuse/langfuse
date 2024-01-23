import { Card } from "@/src/components/ui/card";
import { Textarea } from "@/src/components/ui/textarea";
import { type Dispatch, type SetStateAction } from "react";

export function CompletionInterface({
  lastResponseMode,
  completion,
  prompt,
  setPrompt,
}: {
  lastResponseMode?: "chat" | "completion";
  completion: string;
  prompt: string;
  setPrompt: Dispatch<SetStateAction<string>>;
}) {
  return (
    <div className="flex grow flex-col gap-2 overflow-y-auto">
      <Textarea
        className="min-h-[150px] grow-[2] resize-none font-mono text-xs"
        placeholder="Provide a prompt."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      {lastResponseMode === "completion" && (
        <Card className="mb-4 grow p-4">
          <div className="mb-6">
            <div className="my-2">{completion}</div>
          </div>
        </Card>
      )}
    </div>
  );
}
