import { useRef, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUp10,
  BadgeCheck,
  HardDriveDownload,
  Info,
  Map,
  Newspaper,
} from "@langfuse/icons";
import { SiGithub } from "@langfuse/icons/si";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { StatusBadge } from "@/src/components/ui/StatusBadge/StatusBadge";
import {
  describeVersionState,
  type SidebarVersionState,
} from "@/src/components/nav/versionState";

/**
 * Release, plan, and resource links behind the version badge. The caller
 * renders the badge through `Trigger asChild` and spreads `triggerProps` on it.
 */
export function VersionMenu({
  state,
  children,
}: {
  state: SidebarVersionState;
  children: (control: {
    Trigger: typeof DropdownMenuTrigger;
    triggerProps: { onPointerDown: () => void; onKeyDown: () => void };
  }) => ReactNode;
}) {
  const { selfHostedPlanLabel, backgroundMigrationStatus, update } =
    describeVersionState(state);

  // Radix returns focus to the trigger when the menu closes, and the browser
  // treats that programmatic focus as `:focus-visible`, so the Button's
  // `focus-visible:ring-2` ring is left showing on the badge after a
  // mouse-driven open/close. Keyboard users must keep that ring, so the focus
  // restore is suppressed only for an interaction that never used the keyboard.
  //
  // `pointerOnly` therefore has to be cleared by a key press anywhere in the
  // interaction, not only on the trigger: the menu is portalled, so once it is
  // open every key event lands on the content instead. A mouse-opened menu
  // closed with Escape or Enter is a keyboard interaction and must get focus
  // back on the trigger.
  const pointerOnly = useRef(false);
  const noteKeyboardUse = () => {
    pointerOnly.current = false;
  };

  return (
    <DropdownMenu>
      {children({
        Trigger: DropdownMenuTrigger,
        triggerProps: {
          onPointerDown: () => {
            pointerOnly.current = true;
          },
          onKeyDown: noteKeyboardUse,
        },
      })}
      <DropdownMenuContent
        onClick={(e) => e.stopPropagation()}
        // Both hooks are needed: Radix's DismissableLayer handles Escape before
        // it reaches the content's own onKeyDown, while onKeyDown covers the
        // arrow/Enter/typeahead keys used to pick an item.
        onKeyDown={noteKeyboardUse}
        onEscapeKeyDown={noteKeyboardUse}
        onCloseAutoFocus={(event) => {
          if (!pointerOnly.current) return;
          pointerOnly.current = false;
          event.preventDefault();
        }}
      >
        {update ? (
          <>
            <DropdownMenuLabel>
              New {update.updateType} version: {update.latestRelease}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {!update && state.deployment === "self-hosted" ? (
          <>
            <DropdownMenuLabel>This is the latest release</DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {selfHostedPlanLabel && (
          <>
            <DropdownMenuLabel className="flex items-center font-normal">
              <BadgeCheck size="base" __rawClassName="mr-2" />
              {selfHostedPlanLabel.long}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem asChild>
          <Link
            href="https://github.com/langfuse/langfuse/releases"
            target="_blank"
          >
            <SiGithub size="base" color="default" __rawClassName="mr-2" />
            Releases
          </Link>
        </DropdownMenuItem>
        {state.deployment === "self-hosted" && (
          <DropdownMenuItem asChild>
            <Link href="/background-migrations">
              <ArrowUp10 size="base" color="default" __rawClassName="mr-2" />
              Background Migrations
              {backgroundMigrationStatus && (
                <StatusBadge
                  type={backgroundMigrationStatus}
                  showText={false}
                  variant="transparent"
                />
              )}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="https://langfuse.com/changelog" target="_blank">
            <Newspaper size="base" color="default" __rawClassName="mr-2" />
            Changelog
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="https://langfuse.com/roadmap" target="_blank">
            <Map size="base" color="default" __rawClassName="mr-2" />
            Roadmap
          </Link>
        </DropdownMenuItem>
        {state.deployment === "self-hosted" && (
          <DropdownMenuItem asChild>
            <Link href="https://langfuse.com/pricing-self-host" target="_blank">
              <Info size="base" color="default" __rawClassName="mr-2" />
              Compare Versions
            </Link>
          </DropdownMenuItem>
        )}
        {update && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link
                href="https://langfuse.com/docs/deployment/self-host#update"
                target="_blank"
              >
                <HardDriveDownload
                  size="base"
                  color="default"
                  __rawClassName="mr-2"
                />
                Update
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
