import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { useState } from "react";

export const ExperimentMetadataSection = ({
  metadata,
}: {
  metadata: Record<string, unknown>;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border-t pt-4">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between text-left"
          >
            <span className="text-sm font-bold">Metadata</span>
            {isOpen ? (
              <DropdownIndicator />
            ) : (
              <DropdownIndicator direction="right" />
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
