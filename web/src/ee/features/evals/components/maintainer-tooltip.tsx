import { LangfuseIcon } from "@/src/components/LangfuseLogo";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/src/components/ui/tooltip";
import { RagasAndLangfuseIcon } from "@/src/ee/features/evals/components/ragas-logo";
import { UserCircle2Icon } from "lucide-react";

export function MaintainerTooltip({ maintainer }: { maintainer: string }) {
  const isRagas = maintainer.includes("Ragas");
  const isLangfuse = maintainer.includes("Langfuse");
  return (
    <Tooltip>
      <TooltipTrigger>
        {isRagas ? (
          <RagasAndLangfuseIcon />
        ) : isLangfuse ? (
          <LangfuseIcon size={16} />
        ) : (
          <UserCircle2Icon className="h-4 w-4" />
        )}
      </TooltipTrigger>
      <TooltipContent>{maintainer}</TooltipContent>
    </Tooltip>
  );
}
