import {
  AlertTriangle,
  BadgeCheck,
  Check,
  Github,
  HardDriveDownload,
  Map,
  Newspaper,
} from "lucide-react";

import { VERSION } from "@/src/constants";
import { env } from "@/src/env.mjs";
import { cn } from "@/src/utils/tailwind";
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
import Link from "next/link";
import { useIsEeEnabled } from "@/src/ee/utils/useIsEeEnabled";

const VersionLabel = ({ className }: { className?: string }) => {
  const checkUpdate = api.public.checkUpdate.useQuery(undefined, {
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION, // do not check for updates on Langfuse Cloud
    onError: (error) => console.error("checkUpdate error", error), // do not render default error message
  });
  const isEeVersion =
    useIsEeEnabled() && !Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION);

  const hasUpdate =
    !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION &&
    checkUpdate.data &&
    checkUpdate.data.updateType;

  const color =
    checkUpdate.data?.updateType === "major"
      ? "text-dark-red"
      : checkUpdate.data?.updateType === "minor"
        ? "text-dark-yellow"
        : undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="xs" className={className}>
          {VERSION}
          {hasUpdate && <ArrowUp className={`ml-1 h-3 w-3 ${color}`} />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
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
        {isEeVersion && (
          <>
            <DropdownMenuLabel className="flex items-center font-normal">
              <BadgeCheck size={16} className="mr-2" />
              Enterprise Edition
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

export const LangfuseIcon = ({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src="/icon.svg"
    width={size}
    height={size}
    alt="Langfuse Icon"
    className={className}
  />
);

export const LangfuseLogo = ({
  className,
  size = "sm",
  version = false,
  showEnvLabel = false,
}: {
  size?: "sm" | "xl";
  className?: string;
  version?: boolean;
  showEnvLabel?: boolean;
}) => (
  <div
    className={cn("flex flex-wrap gap-4 lg:flex-col lg:items-start", className)}
  >
    {/* Environment Labeling for Langfuse Maintainers */}
    {showEnvLabel && env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION && (
      <div
        className={cn(
          "flex items-center gap-2 self-stretch rounded-md px-1 py-1 text-xs ring-1 sm:px-3 sm:py-2 lg:-mx-2",
          env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "STAGING"
            ? "bg-light-blue text-dark-blue ring-dark-blue"
            : env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "DEV"
              ? "bg-light-green text-dark-green ring-dark-green"
              : "bg-light-red text-dark-red ring-dark-red",
        )}
      >
        {env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "DEV" ? (
          <Check size={16} className="hidden sm:block" />
        ) : (
          <AlertTriangle size={16} className="hidden sm:block" />
        )}
        <span className="whitespace-nowrap">
          {["EU", "US"].includes(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION)
            ? `PROD-${env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION}`
            : env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION}
        </span>
      </div>
    )}
    {/* Langfuse Logo */}
    <div className="flex items-center">
      <LangfuseIcon size={size === "sm" ? 16 : 20} />
      <span
        className={cn(
          "ml-2 font-mono font-semibold",
          size === "sm" ? "text-sm" : "text-lg",
        )}
      >
        Langfuse
      </span>
      {version && <VersionLabel className="ml-2" />}
    </div>
  </div>
);
