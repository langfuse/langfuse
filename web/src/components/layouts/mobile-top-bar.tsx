import { type ReactNode } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { useSidebar } from "@/src/components/ui/sidebar";
import { TopbarBrand } from "@/src/components/nav/topbar-brand";
import { useHasAppSidebar } from "@/src/components/nav/sidebar-presence";
import { TopbarAccount } from "@/src/components/nav/topbar-account";
import { InAppAiAgentButton } from "@/src/components/nav/in-app-ai-agent-button";
import { EnvLabel } from "@/src/components/EnvLabel";

/**
 * Slim mobile top chrome for the minimal-chrome shell: hamburger · centered
 * Langfuse wordmark · account. Everything page-specific (title, actions,
 * controls, tabs) lives below in the scrollable content (see MobilePageTitle),
 * so this stays a thin, sticky brand bar.
 *
 * Rendered only below `md` (the caller hides it on desktop, where PageHeader
 * takes over). On the sidebar-less MinimalLayout (public shares) there is no
 * hamburger to show — the page's own leadingControl takes the left slot.
 */
export const MobileTopBar = ({
  showSidebarTrigger = true,
  leadingControl,
}: {
  showSidebarTrigger?: boolean;
  leadingControl?: ReactNode;
}) => {
  const { toggleSidebar } = useSidebar();
  const hasAppSidebar = useHasAppSidebar();
  const showHamburger = showSidebarTrigger && hasAppSidebar;

  return (
    <div className="bg-background flex h-12 items-center gap-2 border-b px-2">
      {/* Left: hamburger (opens the nav sheet) or the page's leading control. */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {showHamburger ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            aria-label="Open menu"
            onClick={() => toggleSidebar()}
          >
            <Menu className="size-5" />
          </Button>
        ) : (
          leadingControl
        )}
        {/* EnvLabel defaults to self-stretch (to fill the desktop header row);
            keep it centered here so it doesn't span the full bar height. */}
        <EnvLabel className="self-center" />
      </div>

      {/* Center: the Langfuse wordmark. */}
      <TopbarBrand variant="wordmark" />

      {/* Right: the assistant launcher (prominent, gradient-bordered so it
          reads as a real entry point here) + account. Balances the left slot
          so the brand stays centered. */}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
        <InAppAiAgentButton prominent />
        <TopbarAccount />
      </div>
    </div>
  );
};
