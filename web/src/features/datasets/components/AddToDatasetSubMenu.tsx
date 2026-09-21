import { Database, ExternalLink } from "lucide-react";

import {
  DropdownMenuItem,
  DropdownMenuItemWithSecondaryAction,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/src/components/ui/dropdown-menu";
import { api, type RouterOutputs } from "@/src/utils/api";

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
  const datasets = api.datasets.allDatasetMeta.useQuery(
    { projectId },
    { enabled: !disabled },
  );
  const allDatasets = datasets.data ?? [];

  const renderItems = () => {
    if (datasets.isLoading) {
      return <DropdownMenuItem disabled>Loading datasets...</DropdownMenuItem>;
    }
    if (allDatasets.length === 0) {
      return <DropdownMenuItem disabled>No datasets yet</DropdownMenuItem>;
    }
    return allDatasets.map((dataset) => {
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
        <DropdownMenuSubContent className="max-h-[min(300px,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto">
          {renderItems()}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}
