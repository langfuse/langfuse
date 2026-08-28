import { ActionButtonCountBadge } from "@/src/components/ui/action-button-count-badge";
import { Button } from "@/src/components/ui/button";
import { LockIcon, SquarePen } from "lucide-react";

type AnnotateDrawerMenuButtonProps = {
  annotationCount: number;
  disabled: boolean;
  onClick: () => void;
  showAnnotationCount: boolean;
};

export function AnnotateDrawerMenuButton({
  annotationCount,
  disabled,
  onClick,
  showAnnotationCount,
}: AnnotateDrawerMenuButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={disabled}
      className="w-full justify-start gap-2 font-normal"
      onClick={onClick}
    >
      {disabled ? (
        <LockIcon className="h-3 w-3" />
      ) : (
        <SquarePen className="h-4 w-4" />
      )}
      <span className="text-sm">Annotate</span>
      {showAnnotationCount && annotationCount > 0 ? (
        <span className="ml-1">
          <ActionButtonCountBadge count={annotationCount} />
        </span>
      ) : null}
    </Button>
  );
}
