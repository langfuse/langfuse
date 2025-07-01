import { PromptPlaygroundInstance } from "./components/PromptPlaygroundInstance";
import { usePlaygroundContext } from "./context";
import { PlusCircleIcon } from "lucide-react";
import { useState } from "react";

function cloneMessages(messages: any[]) {
  return messages.map((m) => ({ ...m, id: crypto.randomUUID() }));
}

export default function Playground() {
  const playgroundContext = usePlaygroundContext();
  // Store an array of playground instance states
  const [instances, setInstances] = useState([
    {
      ...playgroundContext,
      messages: cloneMessages(playgroundContext.messages),
      promptVariables: playgroundContext.promptVariables.map((v: any) => ({
        ...v,
      })),
      modelParams: { ...playgroundContext.modelParams },
    },
  ]);

  const handleAddInstance = () => {
    const first = instances[0];
    setInstances((prev) => [
      ...prev,
      {
        ...first,
        messages: cloneMessages(first.messages),
        promptVariables: first.promptVariables.map((v: any) => ({ ...v })),
        modelParams: { ...first.modelParams },
      },
    ]);
  };

  return (
    <div className="flex h-full flex-col space-y-4">
      <div className="flex flex-1 flex-row space-x-8">
        {instances.map((instance, idx) => (
          <PromptPlaygroundInstance key={idx} playgroundContext={instance} />
        ))}
        {/* Floating plus button */}
        <div className="px-12">
          <button
            className="absolute right-6 top-1/2 ml-12 mr-12 flex -translate-y-1/2 items-center justify-center rounded-full border border-input bg-background p-3 shadow transition-all hover:bg-muted"
            aria-label="Add new prompt section"
            onClick={handleAddInstance}
          >
            <PlusCircleIcon size={28} className="text-primary" />
          </button>
        </div>
      </div>
    </div>
  );
}
