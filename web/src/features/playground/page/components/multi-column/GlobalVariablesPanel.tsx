import React from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/src/components/ui/collapsible";
import { cn } from "@/src/utils/tailwind";
import { useMultiPlaygroundContext } from "@/src/features/playground/page/context/multi-playground-context";
import { PromptVariableComponent } from "../PromptVariableComponent";

interface GlobalVariablesPanelProps {
  className?: string;
  defaultOpen?: boolean;
}

export const GlobalVariablesPanel: React.FC<GlobalVariablesPanelProps> = ({
  className,
  defaultOpen = true,
}) => {
  const { promptVariables } = useMultiPlaygroundContext();
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  const renderNoVariables = () => (
    <div className="py-4 text-center">
      <p className="mb-2 text-xs text-muted-foreground">No variables defined.</p>
      <p className="text-xs text-muted-foreground">
        Use handlebars in your prompts to add a variable: &#123;&#123;exampleVariable&#125;&#125;
      </p>
    </div>
  );

  const renderVariables = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
      {promptVariables
        .sort((a, b) => {
          if (a.isUsed && !b.isUsed) return -1;
          if (!a.isUsed && b.isUsed) return 1;
          return a.name.localeCompare(b.name);
        })
        .map((promptVariable) => (
          <div key={promptVariable.name} className="min-w-0">
            <PromptVariableComponent promptVariable={promptVariable} />
          </div>
        ))}
    </div>
  );

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn("border-t bg-background", className)}
    >
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="flex w-full items-center justify-between p-4 hover:bg-muted/50"
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">Global Variables</span>
            {promptVariables.length > 0 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {promptVariables.length}
              </span>
            )}
          </div>
          {isOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t">
        {promptVariables.length === 0 ? renderNoVariables() : renderVariables()}
      </CollapsibleContent>
    </Collapsible>
  );
};