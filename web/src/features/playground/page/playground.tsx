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
    <div className="flex h-full flex-col">
      {/* Configuration Panel - Stacked at top */}
      <div className="flex-shrink-0 border-b bg-muted/20 p-4">
        <div className="space-y-4">
          <ModelParameters {...playgroundContext} />
          <PlaygroundTools />
          <StructuredOutputSchemaSection />
          <Variables />
          <MessagePlaceholders />
        </div>
      </div>

      {/* Messages and Output - Below configuration */}
      <div className="flex-1 overflow-auto p-4">
        <Messages {...playgroundContext} />
      </div>
    </div>
  );
}
