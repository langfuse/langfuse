import motion from "./sidebarMotion.module.css";
import { cn } from "@/src/utils/tailwind";
import { Building2, ChevronsUpDown } from "@langfuse/icons";
import { WorkspaceGlyph } from "@/src/features/app-shell/components/WorkspaceGlyph";
import { WorkspaceSwitcherPopover } from "@/src/features/app-shell/components/WorkspaceSwitcherPopover";
import {
  useAppShellSidebar,
  useAppShellSidebarActions,
} from "@/src/features/app-shell/contexts/AppShellSidebarProvider";
import { useSidebarSurface } from "@/src/features/app-shell/contexts/SidebarSurfaceProvider";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

/**
 * The sidebar's organization and project block. It is the switcher's home:
 * Mod+O opens this same popover from the rail, expanded sidebar, or mobile menu.
 */
export function SidebarWorkspaceSwitcher() {
  const { organization, project } = useQueryProjectOrOrganization();
  const surface = useSidebarSurface();
  const isOpen = useAppShellSidebar(
    (state) => state.activeMenu === "workspace",
  );
  const { setSwitcherOpen } = useAppShellSidebarActions();
  const capture = usePostHogClientCapture();

  const title = project?.name ?? organization?.name ?? "Choose a project";
  const subtitle = project ? organization?.name : "No project selected";
  const glyph = project ?? organization;

  return (
    <WorkspaceSwitcherPopover
      isOpen={isOpen}
      onOpenChange={(nextIsOpen) => {
        if (nextIsOpen) {
          capture("app_shell:workspace_switcher_opened", { source: "sidebar" });
        }
        setSwitcherOpen(nextIsOpen);
      }}
      side={surface === "mobile" ? "bottom" : "right"}
    >
      {({ Trigger }) => (
        <Trigger asChild>
          <button
            type="button"
            aria-label={`Switch project or organization. Current: ${title}`}
            className={cn(
              "ph-no-capture hover:bg-sidebar-accent focus-visible:ring-sidebar-ring data-[state=open]:bg-sidebar-accent rounded-md outline-hidden transition-colors focus-visible:ring-2",
              motion.workspace,
            )}
          >
            <span className={motion.iconLane}>
              {glyph ? (
                <WorkspaceGlyph id={glyph.id} name={glyph.name} size="md" />
              ) : (
                <Building2 size="base" />
              )}
            </span>
            <span className={cn(motion.identity, motion.label)}>
              <span
                className="text-muted-foreground truncate text-xs leading-4"
                title={subtitle}
              >
                {subtitle}
              </span>
              <span
                className="text-foreground truncate text-sm leading-5 font-bold"
                title={title}
              >
                {title}
              </span>
            </span>
            <span className={cn(motion.chevron, motion.label)}>
              <ChevronsUpDown size="base" color="default" />
            </span>
          </button>
        </Trigger>
      )}
    </WorkspaceSwitcherPopover>
  );
}
