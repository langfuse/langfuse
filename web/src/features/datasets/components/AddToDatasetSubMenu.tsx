import { Database, ExternalLink } from "lucide-react";
import { useState } from "react";

import {
  DropdownMenuItem,
  DropdownMenuItemWithSecondaryAction,
  DropdownMenuPortal,
  DropdownMenuSearchInput,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/src/components/ui/dropdown-menu";
import { api, type RouterOutputs } from "@/src/utils/api";

const SEARCHABLE_FROM = 8;

type AddToDatasetSubMenuProps = {
  projectId: string;
  disabled: boolean;
  existingDatasetItems: RouterOutputs["datasets"]["datasetItemsBasedOnTraceOrObservation"];
  onSelectDataset: (datasetId: string) => void;
};

export function AddToDatasetSubMenu({
  projectId,
  disabled,
  existingDatasetItems,
  onSelectDataset,
}: AddToDatasetSubMenuProps) {
  const [query, setQuery] = useState("");
  const datasets = api.datasets.allDatasetMeta.useQuery(
    { projectId },
    { enabled: !disabled },
  );
  const allDatasets = datasets.data ?? [];
  const normalizedQuery = query.trim().toLowerCase();
  const filteredDatasets = normalizedQuery
    ? allDatasets.filter((dataset) =>
        dataset.name.toLowerCase().includes(normalizedQuery),
      )
    : allDatasets;

  const renderItems = () => {
    if (datasets.isLoading) {
      return <DropdownMenuItem disabled>Loading datasets...</DropdownMenuItem>;
    }
    if (allDatasets.length === 0) {
      return <DropdownMenuItem disabled>No datasets yet</DropdownMenuItem>;
    }
    if (filteredDatasets.length === 0) {
      return <DropdownMenuItem disabled>No matching datasets</DropdownMenuItem>;
    }
    return filteredDatasets.map((dataset) => {
      const existingItem = existingDatasetItems.find(
        (item) => item.datasetId === dataset.id,
      );
      return (
        <DropdownMenuItemWithSecondaryAction
          key={dataset.id}
          title={dataset.name}
          onClick={() => onSelectDataset(dataset.id)}
          secondaryAction={
            existingItem
              ? {
                  href: `/project/${projectId}/datasets/${dataset.id}/items/${encodeURIComponent(existingItem.id)}`,
                  icon: ExternalLink,
                  ariaLabel: `Open existing item in ${dataset.name}`,
                }
              : undefined
          }
        />
      );
    });
  };

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger
        disabled={disabled}
        title={
          disabled
            ? "You don't have permission to add items to datasets."
            : undefined
        }
      >
        <Database className="mr-2 h-4 w-4" />
        Dataset
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="flex max-h-[min(300px,var(--radix-dropdown-menu-content-available-height))] flex-col">
          {allDatasets.length >= SEARCHABLE_FROM && (
            <>
              <DropdownMenuSearchInput
                value={query}
                onChange={setQuery}
                placeholder="Search datasets..."
              />
              <DropdownMenuSeparator />
            </>
          )}
          <div className="overflow-y-auto">{renderItems()}</div>
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}
