import { PlaygroundProvider } from "./context";
import { ModelParameters } from "./components/ModelParameters";
import { Variables } from "./components/Variables";
import { Messages } from "./components/Messages";

export default function Playground() {
  return (
    <PlaygroundProvider>
      <div className="flex h-full flex-row space-x-8">
        <div className="h-full basis-3/4 overflow-auto">
          <Messages />
        </div>
        <div className="h-full basis-1/4 pr-2">
          <div className="flex h-full flex-col">
            <div className="flex-1">
              <ModelParameters />
            </div>
            <div className="flex-1 overflow-auto">
              <Variables />
            </div>
          </div>
        </div>
      </div>
    </PlaygroundProvider>
  );
}
