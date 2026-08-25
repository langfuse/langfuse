import { CopyIcon } from "lucide-react";

import { ActionButton } from "@/src/components/ActionButton";
import { type ButtonProps } from "@/src/components/ui/button";

type CopyDatasetItemButtonProps = {
  hasAccess: boolean;
  size: ButtonProps["size"];
  onClick: () => void;
};

export const CopyDatasetItemButton = ({
  hasAccess,
  size,
  onClick,
}: CopyDatasetItemButtonProps) => (
  <ActionButton
    variant="outline"
    size={size === "sm" ? "icon-xs" : "icon"}
    hasAccess={hasAccess}
    title="Copy item"
    aria-label="Copy item"
    onClick={onClick}
  >
    <CopyIcon className="size-3" />
  </ActionButton>
);
