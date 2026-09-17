import { LangfuseIcon } from "@/src/components/design-system/LangfuseIcon/LangfuseIcon";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { RagasLogoIcon } from "./ragas-logo";
import { UserCircle2Icon } from "lucide-react";

function MaintainerIcon({ maintainer }: { maintainer: string }) {
  if (maintainer.includes("Ragas")) {
    return <RagasLogoIcon />;
  } else if (maintainer.includes("Langfuse")) {
    return <LangfuseIcon size={16} />;
  }
  return <UserCircle2Icon className="h-4 w-4" />;
}

export function MaintainerTooltip({ maintainer }: { maintainer: string }) {
  return (
    <Tooltip label={maintainer}>
      {({ getTriggerProps }) => (
        <button
          {...getTriggerProps()}
          type="button"
          aria-label={`Maintained by ${maintainer}`}
          className="inline-flex"
        >
          <MaintainerIcon maintainer={maintainer} />
        </button>
      )}
    </Tooltip>
  );
}
