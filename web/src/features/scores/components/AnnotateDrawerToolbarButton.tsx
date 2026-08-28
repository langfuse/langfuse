import { ActionButtonCountBadge } from "@/src/components/ui/action-button-count-badge";
import { Button, type ButtonProps } from "@/src/components/ui/button";
import { LockIcon, SquarePen } from "lucide-react";

type AnnotateDrawerToolbarButtonProps = {
  annotationCount: number;
  buttonVariant: NonNullable<ButtonProps["variant"]>;
  disabled: boolean;
  onClick: () => void;
  showAnnotationCount: boolean;
  size: NonNullable<ButtonProps["size"]>;
};

export function AnnotateDrawerToolbarButton({
  annotationCount,
  buttonVariant,
  disabled,
  onClick,
  showAnnotationCount,
  size,
}: AnnotateDrawerToolbarButtonProps) {
  return (
    <Button
      variant={buttonVariant}
      size={size}
      disabled={disabled}
      className="rounded-r-none"
      onClick={onClick}
    >
      {disabled ? (
        <LockIcon className="mr-1.5 h-3 w-3" />
      ) : (
        <SquarePen
          className={size === "sm" ? "mr-1.5 h-3.5 w-3.5" : "mr-1.5 h-4 w-4"}
        />
      )}
      <span>Annotate</span>
      {showAnnotationCount && annotationCount > 0 ? (
        <span className="ml-1">
          <ActionButtonCountBadge count={annotationCount} />
        </span>
      ) : null}
    </Button>
  );
}
