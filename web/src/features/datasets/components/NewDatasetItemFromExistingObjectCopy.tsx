import { CopyIcon } from "lucide-react";

import { ActionButton } from "@/src/components/ActionButton";
import { type ButtonProps } from "@/src/components/ui/button";

type NewDatasetItemFromExistingObjectCopyProps = {
  hasAccess: boolean;
  size: ButtonProps["size"];
  onOpen: () => void;
};

export const NewDatasetItemFromExistingObjectCopy = ({
  hasAccess,
  size,
  onOpen,
}: NewDatasetItemFromExistingObjectCopyProps) => (
  <ActionButton
    variant="outline"
    size={size === "sm" ? "icon-xs" : "icon"}
    hasAccess={hasAccess}
    title="Copy item"
    aria-label="Copy item"
    onClick={onOpen}
  >
    <CopyIcon className="size-3" />
  </ActionButton>
);
