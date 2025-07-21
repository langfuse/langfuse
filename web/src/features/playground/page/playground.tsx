import { ModelParameters } from "@/src/components/ModelParameters";
import { usePlaygroundContext } from "./context";
import { Variables } from "./components/Variables";
import { MessagePlaceholders } from "./components/MessagePlaceholders";
import { Messages } from "./components/Messages";
import { PlaygroundTools } from "./components/PlaygroundTools";
import { StructuredOutputSchemaSection } from "./components/StructuredOutputSchemaSection";

export default function Playground() {
  const playgroundContext = usePlaygroundContext();

  return (
    <div className="flex h-full flex-row space-x-8">
      <div className="h-full basis-3/4 overflow-auto">
        <Messages {...playgroundContext} />
      </div>
      <div className="max-h-full min-h-0 basis-1/4 pr-2">
        <div className="flex h-full flex-col gap-4">
          <div className="mb-4 flex-shrink-0 overflow-y-auto">
            <ModelParameters {...playgroundContext} />
          </div>
          <div className="mb-4 max-h-[25vh] flex-shrink-0 overflow-y-auto">
            <PlaygroundTools />
          </div>
          <div className="mb-4 flex-shrink-0">
            <StructuredOutputSchemaSection />
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-6">
            <div className="min-h-0 flex-1">
              <Variables />
            </div>
            <div className="min-h-0 flex-1">
              <MessagePlaceholders />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
