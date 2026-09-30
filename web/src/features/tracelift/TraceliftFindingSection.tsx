import { ArrowUpRight, ListFilter } from "lucide-react";
import { TraceIssue } from "@langfuse/shared";
import Link from "next/link";

import { Accordion } from "@/src/components/design-system/Accordion/Accordion";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Button } from "@/src/components/design-system/Button/Button";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import { type TraceliftFinding } from "./types";

type TraceliftFindingSectionProps = {
  finding: TraceliftFinding;
  onViewObservations: (finding: TraceliftFinding) => void;
  onViewExample: () => void;
};

export function TraceliftFindingSection({
  finding,
  onViewObservations,
  onViewExample,
}: TraceliftFindingSectionProps) {
  if (
    !finding.description &&
    !finding.prompt &&
    !finding.observationIds.length
  ) {
    return (
      <div className="ph-no-capture flex items-center justify-between gap-3 border-b py-3 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="bg-dark-yellow size-1.75 shrink-0 rounded-full"
          />
          <span className="min-w-0 break-words">{finding.title}</span>
        </span>
        <Badge
          text={finding.issueCount.toLocaleString("en-US")}
          size="sm"
          color="primary"
        />
      </div>
    );
  }

  return (
    <Accordion.Item value={finding.id}>
      <Accordion.Trigger size="sm">
        <span className="flex min-w-0 items-center gap-2 py-1.5 text-left">
          <span
            aria-hidden
            className="bg-dark-yellow size-1.75 shrink-0 rounded-full"
          />
          <span className="ph-no-capture min-w-0 break-words">
            {finding.title}
          </span>
          <Badge
            text={finding.issueCount.toLocaleString("en-US")}
            size="sm"
            color="primary"
          />
        </span>
      </Accordion.Trigger>
      <Accordion.Content>
        <div className="flex flex-col gap-3 pt-1 pb-4 pl-4">
          {finding.description && (
            <p className="ph-no-capture text-muted-foreground leading-relaxed">
              {finding.description}
            </p>
          )}
          {finding.recommendation && (
            <div className="flex flex-col gap-1">
              <h4 className="text-xs font-bold">Suggested approach</h4>
              <p className="ph-no-capture text-muted-foreground text-sm leading-relaxed">
                {finding.recommendation}
              </p>
            </div>
          )}
          {finding.id === TraceIssue.INFRASTRUCTURE_SPANS && (
            <div className="bg-muted/50 rounded-md p-3 text-xs">
              <p className="font-bold">
                Estimated savings: $6 per 100,000 spans excluded
              </p>
              <p className="text-muted-foreground mt-1">
                Based on $6 per 100,000 observations. The finding count is not a
                span count; total savings depend on how many redundant spans you
                exclude.
              </p>
            </div>
          )}
          {finding.examples.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <h4 className="font-bold">Examples</h4>
                <span className="text-muted-foreground">
                  {finding.examples.length} shown
                </span>
              </div>
              <ul className="ph-no-capture flex flex-col gap-1">
                {finding.examples.map((example) => (
                  <li key={example.href}>
                    <Link
                      href={example.href}
                      onNavigate={onViewExample}
                      className="hover:bg-accent focus-visible:outline-ring flex min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-xs focus-visible:outline-2"
                    >
                      <span className="text-muted-foreground shrink-0">
                        {example.observationId ? "Observation" : "Trace"}
                      </span>
                      <code
                        className="min-w-0 flex-1 truncate"
                        title={example.observationId ?? example.traceId}
                      >
                        {example.observationId ?? example.traceId}
                      </code>
                      <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {finding.examples.length === 0 &&
            finding.observationIds.length > 0 && (
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
                    <span className="group-data-[state=open]:hidden">
                      Show IDs
                    </span>
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
                        <li
                          key={id}
                          className="text-muted-foreground break-all"
                        >
                          <code className="font-mono text-xs">{id}</code>
                        </li>
                      ))}
                    </ul>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
        </div>
      </Accordion.Content>
    </Accordion.Item>
  );
}
