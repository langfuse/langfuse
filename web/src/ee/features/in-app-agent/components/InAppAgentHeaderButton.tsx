import { BotMessageSquare } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { useInAppAiAgent } from "./InAppAiAgentProvider";

export function InAppAgentHeaderButton() {
  const { isAvailable, open, openAssistant, setOpen } = useInAppAiAgent();

  if (!isAvailable) {
    return null;
  }

  const label = open ? "Close assistant" : "Open assistant";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          aria-pressed={open}
          data-ignore-outside-interaction
          onClick={() => {
            if (open) {
              setOpen(false);
              return;
            }

            openAssistant("page_header");
          }}
          size="sm"
          variant="ghost"
        >
          <BotMessageSquare className="h-4 w-4" />
          <span className="hidden sm:inline">Assistant</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
