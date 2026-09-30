import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { V4MigrationStatusDot } from "@/src/features/v4-migration/V4MigrationBadgeContent";
import { TRACELIFT_TITLE } from "./constants";

export function TraceliftNotificationButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ring-input focus-visible:outline-ring inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full bg-transparent px-2 py-0.5 text-xs font-bold whitespace-nowrap ring focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <V4MigrationStatusDot variant="action" />
      {TRACELIFT_TITLE}
      <DropdownIndicator direction="right" size="sm" />
    </button>
  );
}
