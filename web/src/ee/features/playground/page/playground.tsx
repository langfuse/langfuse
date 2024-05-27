import { ModelParameters } from "@/src/components/ModelParameters";
import { usePlaygroundContext } from "./context";
import { Variables } from "./components/Variables";
import { Messages } from "./components/Messages";

export default function Playground() {
  const playgroundContext = usePlaygroundContext();

  return (
    <div className="flex h-full flex-row space-x-8">
      <div className="h-full basis-3/4 overflow-auto">
        <Messages {...playgroundContext} />
      </div>
      <div className="h-full basis-1/4 pr-2">
        <div className="flex h-full flex-col">
          <div className="basis-[55%] ">
            <ModelParameters {...playgroundContext} />
          </div>
          <div className="mt-4 basis-[45%] overflow-auto">
            <Variables />
          </div>
        </div>
      </div>
    </div>
  );
}
