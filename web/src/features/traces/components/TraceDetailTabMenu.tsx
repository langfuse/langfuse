import { ChevronDown } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenuController,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/src/components/ui/dropdown-menu";
import { InternalFeatureBadge } from "@/src/features/feature-flags";
import type { DetailTab } from "../contexts/SelectionContext";

const labels: Record<DetailTab, string> = {
  preview: "Preview",
  messages: "Messages",
  attributes: "Attributes",
  scores: "Scores",
  log: "Log View",
};

export function TraceDetailTabMenu({
  tabs,
  selectedTab,
  onSelect,
}: {
  tabs: DetailTab[];
  selectedTab: DetailTab;
  onSelect: (tab: DetailTab) => void;
}) {
  return (
    <DropdownMenuController
      align="start"
      renderMenu={() => (
        <DropdownMenuRadioGroup
          value={selectedTab}
          onValueChange={(value) => {
            const tab = tabs.find((tab) => tab === value);
            if (tab) onSelect(tab);
          }}
        >
          {tabs.map((tab) => (
            <DropdownMenuRadioItem key={tab} value={tab}>
              <span className="flex items-center gap-2">
                {labels[tab]}
                {tab === "messages" && <InternalFeatureBadge />}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      )}
    >
      {({ Trigger }) => (
        <Trigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Detail view: ${labels[selectedTab]}`}
            className="h-7 gap-1.5"
          >
            {labels[selectedTab]}
            {selectedTab === "messages" && <InternalFeatureBadge />}
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </Trigger>
      )}
    </DropdownMenuController>
  );
}
