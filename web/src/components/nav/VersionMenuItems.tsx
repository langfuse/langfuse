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
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/src/components/ui/dropdown-menu";
import { VersionAttentionDot } from "@/src/components/nav/VersionAttentionDot";
import type {
  describeVersionState,
  SidebarVersionState,
} from "@/src/components/nav/versionState";

/** Release, plan and resource entries shared by both navigation menus. */
export function VersionMenuItems({
  state,
  details,
}: {
  state: SidebarVersionState;
  details: ReturnType<typeof describeVersionState>;
}) {
  const { selfHostedPlanLabel, backgroundMigrationStatus, update } = details;
  return (
    <>
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
            Background migrations
            {backgroundMigrationStatus && (
              <span className="ml-2 inline-flex">
                <VersionAttentionDot
                  label="Background migration running"
                  tone="migration"
                />
              </span>
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
            Compare versions
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
              {!backgroundMigrationStatus && (
                <span className="ml-2 inline-flex">
                  <VersionAttentionDot
                    label="Update available"
                    tone={update.updateType}
                  />
                </span>
              )}
            </Link>
          </DropdownMenuItem>
        </>
      )}
    </>
  );
}
