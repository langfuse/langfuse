import {
  ArrowUp10,
  BadgeCheck,
  Github,
  HardDriveDownload,
  Info,
  Map,
  Newspaper,
} from "lucide-react";
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
import { env } from "@/src/env.mjs";
import { cn } from "@/src/utils/tailwind";
import { usePlan } from "@/src/features/entitlements/hooks";
import { isSelfHostedPlan, planLabels } from "@langfuse/shared";
import { StatusBadge } from "@/src/components/layouts/status-badge";

export const VersionLabel = ({ className }: { className?: string }) => {
  const backgroundMigrationStatus = api.backgroundMigrations.status.useQuery(
    undefined,
    {
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      enabled: !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION, // do not check for updates on Langfuse Cloud
      onError: (error) => console.error("checkUpdate error", error), // do not render default error message
    },
  );

  const checkUpdate = api.public.checkUpdate.useQuery(undefined, {
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION, // do not check for updates on Langfuse Cloud
    onError: (error) => console.error("checkUpdate error", error), // do not render default error message
  });

  const plan = usePlan();
  const isLangfuseCloud = Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION);

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
    !isLangfuseCloud && checkUpdate.data && checkUpdate.data.updateType;

  const color =
    checkUpdate.data?.updateType === "major"
      ? "text-dark-red"
      : checkUpdate.data?.updateType === "minor"
        ? "text-dark-yellow"
        : undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="xs" className={cn("text-xs", className)}>
          {VERSION}
          {selfHostedPlanLabel ? ` ${selfHostedPlanLabel.short}` : null}
          {showBackgroundMigrationStatus && (
            <StatusBadge
              type={backgroundMigrationStatus.data?.status.toLowerCase()}
              showText={false}
              className="bg-transparent"
            />
          )}
          {hasUpdate && !showBackgroundMigrationStatus && (
            <ArrowUp className={`ml-1 h-3 w-3 ${color}`} />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
        {hasUpdate ? (
          <>
            <DropdownMenuLabel>
              New {checkUpdate.data?.updateType} version:{" "}
              {checkUpdate.data?.latestRelease}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION ? (
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
            <Github size={16} className="mr-2" />
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
              <Link
                href="https://langfuse.com/docs/deployment/self-host#update"
                target="_blank"
              >
                <HardDriveDownload size={16} className="mr-2" />
                Update
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
