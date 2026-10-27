import { ChevronsUpDown } from "@langfuse/icons";
import { KeyboardShortcut } from "@/src/components/design-system/KeyboardShortcut/KeyboardShortcut";
import { WorkspaceGlyph } from "@/src/features/app-shell/components/WorkspaceGlyph";
import { WorkspaceSwitcherPopover } from "@/src/features/app-shell/components/WorkspaceSwitcherPopover";
import {
  useAppShellSidebar,
  useAppShellSidebarActions,
} from "@/src/features/app-shell/contexts/AppShellSidebarProvider";
import { useSidebarSurface } from "@/src/features/app-shell/contexts/SidebarSurfaceProvider";
import { useQueryProjectOrOrganization } from "@/src/features/projects";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";

/**
 * The sidebar's organization and project block. It is the switcher's home:
 * Mod+O opens this same popover, revealing the sidebar first when hidden.
 */
export function SidebarWorkspaceSwitcher() {
  const { organization, project } = useQueryProjectOrOrganization();
  const surface = useSidebarSurface();
  const isOpen = useAppShellSidebar((state) => state.isSwitcherOpen);
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
      side={surface === "sheet" ? "bottom" : "right"}
    >
      {({ Trigger }) => (
        <Trigger asChild>
          <button
            type="button"
            aria-label={`Switch project or organization. Current: ${title}`}
            className="group/switcher border-sidebar-border bg-background hover:bg-sidebar-accent focus-visible:ring-sidebar-ring data-[state=open]:bg-sidebar-accent flex w-full min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-left outline-hidden transition-colors focus-visible:ring-2"
          >
            {glyph ? (
              <WorkspaceGlyph id={glyph.id} name={glyph.name} size="md" />
            ) : null}
            <span className="flex min-w-0 flex-1 flex-col">
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
            <span className="hidden group-hover/switcher:inline-flex group-focus-visible/switcher:inline-flex">
              <KeyboardShortcut keys={["Mod", "O"]} size="sm" />
            </span>
            <ChevronsUpDown size="base" color="default" />
          </button>
        </Trigger>
      )}
    </WorkspaceSwitcherPopover>
  );
}
