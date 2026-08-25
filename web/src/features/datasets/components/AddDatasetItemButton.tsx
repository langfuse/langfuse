import { LockIcon, PlusIcon } from "lucide-react";

import { Button, type ButtonProps } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";

type AddDatasetItemButtonProps = {
  hasAccess: boolean;
  variant: ButtonProps["variant"];
  size: ButtonProps["size"];
  onClick: () => void;
};

export const AddDatasetItemButton = ({
  hasAccess,
  variant,
  size,
  onClick,
}: AddDatasetItemButtonProps) => (
  <Button onClick={onClick} variant={variant} size={size} disabled={!hasAccess}>
    {hasAccess ? (
      <PlusIcon
        className={cn(
          "mr-1.5 -ml-0.5",
          size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4",
        )}
        aria-hidden="true"
      />
    ) : null}
    Add to datasets
    {!hasAccess ? (
      <LockIcon className="ml-1.5 h-3 w-3" aria-hidden="true" />
    ) : null}
  </Button>
);
