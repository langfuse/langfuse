import { ModelParameters } from "@/src/components/ModelParameters";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Messages } from "./Messages";
import { PlaygroundProvider, usePlaygroundContext } from "../context";
import { Variables } from "./Variables";
import { ChevronDownIcon, XIcon } from "lucide-react";
import { Button } from "@/src/components/ui/button";

const ModelView: React.FC<ModelViewContentProps> = (props) => {
  return (
    <PlaygroundProvider>
      <ModelViewContent {...props} />
    </PlaygroundProvider>
  );
};

interface ModelViewContentProps {
  onRemove: () => void;
  isRemoveButtonDisabled?: boolean;
}

const ModelViewContent: React.FC<ModelViewContentProps> = ({
  onRemove,
  isRemoveButtonDisabled,
}) => {
  const playgroundContext = usePlaygroundContext();

  return (
    <div className="w-full min-w-[400px] space-y-3">
      <div className="flex items-center justify-between">
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button variant="outline" className="flex items-center">
              <span>{playgroundContext.modelParams.model.value}</span>
              <ChevronDownIcon className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="max-h-96 overflow-y-auto p-4"
          >
            <DropdownMenuItem className="font-semibold" asChild>
              <>
                <div className="mb-4 max-h-[80dvh] min-h-[20dvh] overflow-y-auto">
                  <ModelParameters {...playgroundContext} />
                </div>
                <div className="min-h-[20dvh]">
                  <Variables />
                </div>
              </>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          className="text-gray-400 hover:text-gray-500 disabled:cursor-not-allowed disabled:text-gray-300"
          onClick={onRemove}
          disabled={isRemoveButtonDisabled}
        >
          <XIcon aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      <div className="h-full basis-3/4 overflow-auto">
        <Messages {...playgroundContext} />
      </div>
    </div>
  );
};

export default ModelView;
