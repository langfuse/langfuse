import { ChevronDown, PlusIcon } from "lucide-react";
import Link from "next/link";

import { Button, type ButtonProps } from "@/src/components/ui/button";
import {
  DropdownMenuController,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/src/components/ui/dropdown-menu";

type DatasetItemReference = {
  id: string;
  datasetId: string;
  datasetName: string;
};

type NewDatasetItemFromExistingObjectInDatasetsProps = {
  projectId: string;
  items: DatasetItemReference[];
  hasAccess: boolean;
  size: ButtonProps["size"];
  layout: "toolbar" | "menu";
  onOpen: () => void;
};

export const NewDatasetItemFromExistingObjectInDatasets = ({
  projectId,
  items,
  hasAccess,
  size,
  layout,
  onOpen,
}: NewDatasetItemFromExistingObjectInDatasetsProps) => (
  <DropdownMenuController
    align="end"
    renderMenu={() => (
      <>
        {items.map(({ id, datasetName, datasetId }) => (
          <DropdownMenuItem key={id} className="capitalize" asChild>
            <Link
              href={`/project/${projectId}/datasets/${datasetId}/items/${id}`}
            >
              {datasetName}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="capitalize" onClick={onOpen}>
          <PlusIcon size={16} className="mr-2" aria-hidden="true" />
          Add to more datasets
        </DropdownMenuItem>
      </>
    )}
  >
    {({ Trigger }) => (
      <Trigger asChild>
        <Button
          variant={layout === "menu" ? "ghost" : "secondary"}
          size={layout === "menu" ? "sm" : size}
          disabled={!hasAccess}
          className={
            layout === "menu"
              ? "w-full justify-start gap-2 font-normal"
              : undefined
          }
        >
          {layout === "menu" ? (
            <PlusIcon className="h-4 w-4" aria-hidden="true" />
          ) : null}
          <span className={layout === "menu" ? "text-sm" : undefined}>
            In {items.length} dataset(s)
          </span>
          <ChevronDown
            className={layout === "menu" ? "ml-auto h-3 w-3" : "ml-2 h-3 w-3"}
          />
        </Button>
      </Trigger>
    )}
  </DropdownMenuController>
);
