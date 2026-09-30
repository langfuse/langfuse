import { Check, Copy, ListFilter, Sparkles } from "lucide-react";
import { useState } from "react";

import { Accordion } from "@/src/components/design-system/Accordion/Accordion";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Button } from "@/src/components/design-system/Button/Button";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { type TraceliftFinding } from "./types";

type TraceliftFindingSectionProps = {
  finding: TraceliftFinding;
  onOpenAssistant: (finding: TraceliftFinding) => void;
  onViewObservations: (finding: TraceliftFinding) => void;
};

export function TraceliftFindingSection({
  finding,
  onOpenAssistant,
  onViewObservations,
}: TraceliftFindingSectionProps) {
  const [copyState, setCopyState] = useState<
    "idle" | "copying" | "copied" | "failed"
  >("idle");

  const copyPrompt = async () => {
    setCopyState("copying");
    try {
      await copyTextToClipboard(finding.prompt);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <Accordion.Item value={finding.id}>
      <Accordion.Trigger size="sm">
        <span className="flex min-w-0 items-center gap-2 py-1.5 text-left">
          <span
            aria-hidden
            className="bg-dark-yellow size-1.75 shrink-0 rounded-full"
          />
          <span>{finding.title}</span>
          <Badge
            text={finding.observationCount.toLocaleString("en-US")}
            size="sm"
            color="primary"
          />
        </span>
      </Accordion.Trigger>
      <Accordion.Content>
        <div className="flex flex-col gap-3 pt-1 pb-4 pl-4">
          <p className="text-muted-foreground leading-relaxed">
            {finding.description}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Button
              text={
                copyState === "copied" ? "Prompt copied" : "Copy agent prompt"
              }
              icon={copyState === "copied" ? Check : Copy}
              size="sm"
              variant="secondary"
              loading={copyState === "copying"}
              onClick={copyPrompt}
            />
            <Button
              text="Open assistant"
              icon={Sparkles}
              size="sm"
              variant="ghost"
              onClick={() => onOpenAssistant(finding)}
            />
          </div>
          <Collapsible>
            <div className="flex items-center gap-1">
              <Button
                text="View observations"
                icon={ListFilter}
                size="sm"
                variant="ghost"
                onClick={() => onViewObservations(finding)}
              />
              <span aria-hidden className="h-3 border-l" />
              <CollapsibleTrigger className="group text-muted-foreground hover:text-foreground focus-visible:outline-ring inline-flex h-7 items-center gap-1 rounded px-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 [&[data-state=open]>svg]:rotate-180">
                <span className="group-data-[state=open]:hidden">Show IDs</span>
                <span className="hidden group-data-[state=open]:inline">
                  Hide IDs
                </span>
                <DropdownIndicator size="sm" />
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent>
              <div className="pt-2">
                <ul
                  aria-label="Observation IDs"
                  className="ph-no-capture bg-muted/50 flex max-h-24 flex-col gap-1 overflow-y-auto rounded-md px-3 py-2"
                >
                  {finding.observationIds.map((id) => (
                    <li key={id} className="text-muted-foreground break-all">
                      <code className="font-mono text-xs">{id}</code>
                    </li>
                  ))}
                </ul>
              </div>
            </CollapsibleContent>
          </Collapsible>
          {copyState === "failed" && (
            <p role="status" className="text-muted-foreground text-xs">
              Could not copy the prompt. Allow clipboard access and try again.
            </p>
          )}
        </div>
      </Accordion.Content>
    </Accordion.Item>
  );
}
