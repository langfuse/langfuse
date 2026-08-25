import { LockIcon, PlusIcon } from "lucide-react";

import { Button } from "@/src/components/ui/button";

type AddDatasetItemMenuItemProps = {
  hasAccess: boolean;
  onClick: () => void;
};

export const AddDatasetItemMenuItem = ({
  hasAccess,
  onClick,
}: AddDatasetItemMenuItemProps) => (
  <Button
    variant="ghost"
    size="sm"
    disabled={!hasAccess}
    className="w-full justify-start gap-2 font-normal"
    onClick={onClick}
  >
    {hasAccess ? (
      <PlusIcon className="h-4 w-4" aria-hidden="true" />
    ) : (
      <LockIcon className="h-3 w-3" aria-hidden="true" />
    )}
    <span className="text-sm">Add to datasets</span>
  </Button>
);
