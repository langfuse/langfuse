import { PlusCircleIcon } from "lucide-react";
import { PromptPlaygroundInstance } from "./components/PromptPlaygroundInstance";
import { usePlaygroundContext } from "./context";

export default function Playground() {
  const playgroundContext = usePlaygroundContext();

  return (
    <div className="flex h-full flex-col space-y-4">
      <div className="flex flex-1 flex-row space-x-8">
        {/* Main content area as reusable component */}
        <PromptPlaygroundInstance playgroundContext={playgroundContext} />
        {/* Floating plus button */}
        <div className="px-12">
          <button
            className="absolute right-6 top-1/2 ml-12 mr-12 flex -translate-y-1/2 items-center justify-center rounded-full border border-input bg-background p-3 shadow transition-all hover:bg-muted"
            aria-label="Add new prompt section"
          >
            <PlusCircleIcon size={28} className="text-primary" />
          </button>
        </div>
      </div>
    </div>
  );
}
