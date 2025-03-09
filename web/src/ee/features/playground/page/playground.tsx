import { PlaygroundProvider } from "./context";
import { CirclePlus } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import Prompt from "@/src/ee/features/playground/page/components/Prompt";
import { useState } from "react";

export default function Playground() {
  const [lastPromptId, setLastPromptId] = useState(0);
  const [prompts, setPrompts] = useState([0]);
  const newPrompt = () => {
    const nextPromptId = lastPromptId + 1;
    setLastPromptId(nextPromptId);
    setPrompts([...prompts, nextPromptId]);
  };

  return (
    <div className="flex h-full space-x-3 overflow-y-auto p-3">
      {prompts.map((promptKey) => (
        <PlaygroundProvider key={promptKey} promptKey={promptKey}>
          <Prompt />
        </PlaygroundProvider>
      ))}
      <div className="flex h-full flex-col items-center justify-center py-3">
        <Button
          variant="ghost"
          className="m-0 aspect-square self-center rounded-full p-0"
          onClick={newPrompt}
        >
          <CirclePlus size={24} />
        </Button>
      </div>
    </div>
  );
}
