import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

export const ExperimentMetadataSection = ({
  metadata,
}: {
  metadata: Record<string, unknown> | undefined;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  if (Object.keys(metadata ?? {}).length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border-t pt-4">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between text-left"
          >
            <span className="text-sm font-medium">Metadata</span>
            {isOpen ? (
              <ChevronDown className="text-muted-foreground h-4 w-4" />
            ) : (
              <ChevronRight className="text-muted-foreground h-4 w-4" />
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <PrettyJsonView
            json={metadata}
            currentView="pretty"
            className="w-full"
          />
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};
