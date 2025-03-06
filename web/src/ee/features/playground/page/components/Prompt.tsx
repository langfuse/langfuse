import { ModelParameters } from "@/src/components/ModelParameters";
import { usePlaygroundContext } from "../context";
import { Messages } from "../components/Messages";
import { SaveToPromptButton } from "@/src/ee/features/playground/page/components/SaveToPromptButton";

export default function Prompt() {
  const playgroundContext = usePlaygroundContext();

  return (
    <>
      <div className="flex h-full min-w-[64ch] flex-col space-y-3 rounded-md border py-3">
        <div className="flex items-center border-b px-3 pb-3">
          <p className="font-semibold">Prompt Config</p>
          <div className="flex-1" />
          <SaveToPromptButton />
        </div>
        <div className="px-3">
          <ModelParameters defaultCollapsed {...playgroundContext} />
        </div>
        <div className="min-h-96 flex-1 overflow-auto px-3">
          <Messages {...playgroundContext} />
        </div>
      </div>
    </>
  );
}
