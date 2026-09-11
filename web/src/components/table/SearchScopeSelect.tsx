import { ChevronDown } from "lucide-react";
import type { TracingSearchType } from "@langfuse/shared";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenuController,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/src/components/ui/dropdown-menu";
import {
  getSearchButtonLabel,
  getSearchMode,
  searchModeToType,
} from "@/src/components/table/utils/searchUtils";

export function SearchScopeSelect({
  searchType,
  setSearchType,
  metadataLabel,
  fullTextLabel,
  availableSearchTypes,
}: {
  searchType: TracingSearchType[];
  setSearchType: (types: TracingSearchType[]) => void;
  metadataLabel: string;
  fullTextLabel: string;
  availableSearchTypes: { content: boolean; input: boolean; output: boolean };
}) {
  const mode = getSearchMode(searchType, true);
  return (
    <DropdownMenuController
      align="end"
      renderMenu={() => (
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(value) => setSearchType(searchModeToType(value))}
        >
          <DropdownMenuRadioItem value="metadata">
            {metadataLabel}
          </DropdownMenuRadioItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>{fullTextLabel}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={mode}
                onValueChange={(value) =>
                  setSearchType(searchModeToType(value))
                }
              >
                {availableSearchTypes.content && (
                  <DropdownMenuRadioItem value="metadata_fulltext">
                    Input/Output
                  </DropdownMenuRadioItem>
                )}
                {availableSearchTypes.input && (
                  <DropdownMenuRadioItem value="metadata_fulltext_input">
                    Input
                  </DropdownMenuRadioItem>
                )}
                {availableSearchTypes.output && (
                  <DropdownMenuRadioItem value="metadata_fulltext_output">
                    Output
                  </DropdownMenuRadioItem>
                )}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuRadioGroup>
      )}
    >
      {({ Trigger }) => (
        <Trigger asChild>
          <Button variant="outline" size="sm" aria-label="Search scope">
            {getSearchButtonLabel(searchType, metadataLabel)}
            <ChevronDown className="h-4 w-4" />
          </Button>
        </Trigger>
      )}
    </DropdownMenuController>
  );
}
