import {
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/src/components/ui/dropdown-menu";
import { VersionAttentionDot } from "@/src/components/nav/VersionAttentionDot";
import { VersionMenuItems } from "@/src/components/nav/VersionMenuItems";
import {
  describeVersionState,
  getVersionStatusDot,
  type SidebarVersionState,
} from "@/src/components/nav/versionState";

/** The version entry in the account menu; release, plan, and resource links sit behind it. */
export function VersionSubmenu({
  state,
  version,
  submenuSideOffset,
}: {
  state: SidebarVersionState;
  version?: string;
  /** Negative values pull the submenu over its parent, for menus as wide as the screen. */
  submenuSideOffset?: number;
}) {
  const details = describeVersionState(state, version);
  const statusDot = getVersionStatusDot(details);
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <span className="flex items-center gap-1.5">
          {details.versionText}
          {statusDot && <VersionAttentionDot {...statusDot} />}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent sideOffset={submenuSideOffset}>
        <VersionMenuItems state={state} details={details} />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
