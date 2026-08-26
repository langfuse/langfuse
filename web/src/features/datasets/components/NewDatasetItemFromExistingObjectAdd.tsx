import { LockIcon, PlusIcon } from "lucide-react";

import { Button, type ButtonProps } from "@/src/components/ui/button";

type NewDatasetItemFromExistingObjectAddProps = {
  hasAccess: boolean;
  variant: ButtonProps["variant"];
  size: ButtonProps["size"];
  layout: "toolbar" | "menu";
  onOpen: () => void;
};

export const NewDatasetItemFromExistingObjectAdd = ({
  hasAccess,
  variant,
  size,
  layout,
  onOpen,
}: NewDatasetItemFromExistingObjectAddProps) =>
  layout === "menu" ? (
    <Button
      variant="ghost"
      size="sm"
      disabled={!hasAccess}
      className="w-full justify-start gap-2 font-normal"
      onClick={onOpen}
    >
      {hasAccess ? <PlusIcon className="h-4 w-4" aria-hidden="true" /> : null}
      <span className="text-sm">Add to datasets</span>
      {!hasAccess ? (
        <LockIcon className="ml-auto h-3 w-3" aria-hidden="true" />
      ) : null}
    </Button>
  ) : (
    <Button
      onClick={onOpen}
      variant={variant}
      size={size}
      disabled={!hasAccess}
    >
      {hasAccess ? (
        <PlusIcon
          className={`mr-1.5 -ml-0.5 ${
            size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"
          }`}
          aria-hidden="true"
        />
      ) : null}
      Add to datasets
      {!hasAccess ? (
        <LockIcon className="ml-1.5 h-3 w-3" aria-hidden="true" />
      ) : null}
    </Button>
  );
