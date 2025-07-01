import { ModelParameters } from "@/src/components/ModelParameters";
import { usePlaygroundContext } from "./context";
import { Variables } from "./components/Variables";
import { Messages } from "./components/Messages";
import { PlaygroundTools } from "./components/PlaygroundTools";
import { StructuredOutputSchemaSection } from "./components/StructuredOutputSchemaSection";
import { CreateLLMApiKeyDialog } from "@/src/features/public-api/components/CreateLLMApiKeyDialog";
import { Button } from "@/src/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Plus, PlusCircleIcon, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";

export default function Playground() {
  const playgroundContext = usePlaygroundContext();
  const {
    modelParams,
    availableProviders,
    availableModels,
    updateModelParamValue,
  } = playgroundContext;

  // State for controlling the API key dialog
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  // State for controlling the variables dialog
  const [variablesDialogOpen, setVariablesDialogOpen] = useState(false);

  return (
    <div className="flex h-full flex-col space-y-4">
      <div className="flex flex-1 flex-row space-x-8">
        {/* Main content area as a card with top bar and messages grouped */}
        <div className="flex h-full w-full flex-col overflow-auto rounded-lg bg-background p-6 shadow">
          {/* Top bar for model configuration summary (now inside the card) */}
          <div className="mb-4 flex items-center justify-between">
            {availableProviders.length === 0 ? (
              <CreateLLMApiKeyDialog />
            ) : (
              <div className="flex w-full items-center gap-4 text-sm">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Provider:</span>
                    <Select
                      value={modelParams.provider.value}
                      onValueChange={(value) => {
                        updateModelParamValue("provider", value);
                      }}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableProviders.map((provider) => (
                          <SelectItem key={provider} value={provider}>
                            {provider}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Model:</span>
                    <Select
                      value={modelParams.model.value}
                      onValueChange={(value) => {
                        updateModelParamValue("model", value);
                      }}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Select model" />
                      </SelectTrigger>
                      <SelectContent>
                        {[...new Set(availableModels)].map((model) => (
                          <SelectItem key={model} value={model}>
                            {model}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Variables button */}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 p-0"
                          onClick={() => setVariablesDialogOpen(true)}
                        >
                          <SlidersHorizontal className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        Configure variables
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Dialog
                    open={variablesDialogOpen}
                    onOpenChange={setVariablesDialogOpen}
                  >
                    <DialogContent className="max-h-[90%] min-w-[40vw] overflow-auto">
                      <DialogHeader>
                        <DialogTitle>Configure Variables</DialogTitle>
                      </DialogHeader>
                      <div className="flex max-w-xl flex-col rounded-lg bg-background p-4 shadow">
                        <Variables />
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
                <div className="flex-grow" />
                {/* Add API key button on the far right with tooltip and dialog, only if there are API keys */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 p-0"
                        onClick={() => setApiKeyDialogOpen(true)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      Add a new LLM API key
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Dialog
                  open={apiKeyDialogOpen}
                  onOpenChange={setApiKeyDialogOpen}
                >
                  <DialogContent className="max-h-[90%] min-w-[40vw] overflow-auto">
                    <CreateLLMApiKeyDialog />
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </div>
          {/* Messages area */}
          <div className="flex min-h-[500px] flex-1 flex-col">
            <Messages {...playgroundContext} />
          </div>
        </div>
        {/* Floating plus button */}
        <div className="px-12">
          <button
            className="absolute right-12 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full border border-input bg-background p-3 shadow transition-all hover:bg-muted"
            style={{ marginLeft: "32px" }}
            aria-label="Add new prompt section"
          >
            <PlusCircleIcon size={28} className="text-primary" />
          </button>
        </div>
      </div>
    </div>
  );
}
