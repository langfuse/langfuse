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
        <div className="flex h-full flex-col gap-4 overflow-auto">
          <div className="mb-4 flex-shrink-0 overflow-y-auto">
            <ModelParameters {...playgroundContext} />
          </div>
          <div className="mb-4 max-h-[25vh] flex-shrink-0 overflow-y-auto">
            <PlaygroundTools />
          </div>
          <div className="mb-4 flex-shrink-0">
            <StructuredOutputSchemaSection />
          </div>
          <div className="flex-grow overflow-y-auto">
            <div className="space-y-6">
              <Variables />
              <MessagePlaceholders />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
