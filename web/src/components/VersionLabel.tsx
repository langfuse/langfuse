import {
  ArrowUp10,
  BadgeCheck,
  HardDriveDownload,
  Info,
  Map,
  Newspaper,
} from "lucide-react";
import { SiGithub } from "react-icons/si";
import { VERSION } from "@/src/constants";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/src/components/ui/dropdown-menu";
import { ArrowUp } from "lucide-react";
import { api } from "@/src/utils/api";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";
import { usePlan } from "@/src/features/entitlements/hooks";
import { isSelfHostedPlan, planLabels } from "@langfuse/shared";
import { StatusBadge } from "@/src/components/layouts/status-badge";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import {
  useShowV4UpgradeHint,
  V4_UPGRADE_GUIDE_URL,
  V4_UPGRADE_HINT_TITLE,
} from "@/src/features/v4-upgrade/useV4UpgradeHint";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export const VersionLabel = ({ className }: { className?: string }) => {
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const capture = usePostHogClientCapture();
  // Self-hosted v3 always points at v4, even when the release check is
  // unavailable (e.g. air-gapped deployments).
  const showV4UpgradeHint = useShowV4UpgradeHint();

  const backgroundMigrationStatus = api.backgroundMigrations.status.useQuery(
    undefined,
    {
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      enabled: !isLangfuseCloud, // do not check for updates on Langfuse Cloud
      throwOnError: false, // do not render default error message
    },
  );

  const checkUpdate = api.public.checkUpdate.useQuery(undefined, {
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: !isLangfuseCloud, // do not check for updates on Langfuse Cloud
    throwOnError: false, // do not render default error message
  });

  const plan = usePlan();

  const selfHostedPlanLabel = !isLangfuseCloud
    ? plan && isSelfHostedPlan(plan)
      ? // self-host plan
        // TODO: clean up to use planLabels in packages/shared/src/features/entitlements/plans.ts
        {
          short: plan === "self-hosted:pro" ? "Pro" : "EE",
          long: planLabels[plan],
        }
      : // no plan, oss
        {
          short: "OSS",
          long: "Open Source",
        }
    : // null on cloud
      null;

  const showBackgroundMigrationStatus =
    !isLangfuseCloud &&
    backgroundMigrationStatus.data &&
    backgroundMigrationStatus.data.status !== "FINISHED";

  const hasUpdate =
    !isLangfuseCloud &&
    (showV4UpgradeHint || Boolean(checkUpdate.data?.updateType));

  const color =
    showV4UpgradeHint || checkUpdate.data?.updateType === "major"
      ? "text-dark-red"
      : checkUpdate.data?.updateType === "minor"
        ? "text-dark-yellow"
        : undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          className={cn("mt-[0.2px] text-[0.625rem]", className)}
        >
          {VERSION}
          {selfHostedPlanLabel ? <> {selfHostedPlanLabel.short}</> : null}
          {showBackgroundMigrationStatus && (
            <StatusBadge
              type={backgroundMigrationStatus.data?.status.toLowerCase()}
              showText={false}
              className="bg-transparent"
            />
          )}
          {hasUpdate && !showBackgroundMigrationStatus && (
            <ArrowUp className={`h-3 w-3 ${color}`} />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
        {showV4UpgradeHint ? (
          <>
            <DropdownMenuLabel>
              {V4_UPGRADE_HINT_TITLE}
              {checkUpdate.data?.latestRelease
                ? `: ${checkUpdate.data.latestRelease}`
                : null}
              <p className="text-muted-foreground font-normal">
                v3 no longer receives feature updates.
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : hasUpdate ? (
          <>
            <DropdownMenuLabel>
              New {checkUpdate.data?.updateType} version:{" "}
              {checkUpdate.data?.latestRelease}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : !isLangfuseCloud ? (
          <>
            <DropdownMenuLabel>This is the latest release</DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {selfHostedPlanLabel && (
          <>
            <DropdownMenuLabel className="flex items-center font-normal">
              <BadgeCheck size={16} className="mr-2" />
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
            <SiGithub size={16} className="mr-2" />
            Releases
          </Link>
        </DropdownMenuItem>
        {!isLangfuseCloud && (
          <DropdownMenuItem asChild>
            <Link href="/background-migrations">
              <ArrowUp10 size={16} className="mr-2" />
              Background Migrations
              {showBackgroundMigrationStatus && (
                <StatusBadge
                  type={backgroundMigrationStatus.data?.status.toLowerCase()}
                  showText={false}
                  className="bg-transparent"
                />
              )}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="https://langfuse.com/changelog" target="_blank">
            <Newspaper size={16} className="mr-2" />
            Changelog
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="https://langfuse.com/roadmap" target="_blank">
            <Map size={16} className="mr-2" />
            Roadmap
          </Link>
        </DropdownMenuItem>
        {!isLangfuseCloud && (
          <DropdownMenuItem asChild>
            <Link href="https://langfuse.com/pricing-self-host" target="_blank">
              <Info size={16} className="mr-2" />
              Compare Versions
            </Link>
          </DropdownMenuItem>
        )}
        {hasUpdate && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              {showV4UpgradeHint ? (
                <Link
                  href={V4_UPGRADE_GUIDE_URL}
                  target="_blank"
                  onClick={() =>
                    capture("v4_upgrade_hint:click_upgrade_guide", {
                      surface: "version_label",
                    })
                  }
                >
                  <HardDriveDownload size={16} className="mr-2" />
                  Upgrade to v4
                </Link>
              ) : (
                <Link
                  href="https://langfuse.com/docs/deployment/self-host#update"
                  target="_blank"
                >
                  <HardDriveDownload size={16} className="mr-2" />
                  Update
                </Link>
              )}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
