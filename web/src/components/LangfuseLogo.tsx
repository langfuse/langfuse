import { AlertTriangle, Check } from "lucide-react";

import { VERSION } from "@/src/constants";
import { env } from "@/src/env.mjs";
import { cn } from "@/src/utils/tailwind";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/src/components/ui/popover";
import { ArrowUp } from "lucide-react";
import { api } from "@/src/utils/api";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";

const VersionLabel = ({ className }: { className?: string }) => {
  const checkUpdate = api.public.checkUpdate.useQuery(undefined, {
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION, // do not check for updates on Langfuse Cloud
    onError: (error) => console.error("checkUpdate error", error), // do not render default error message
  });

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
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs" className={className}>
          {VERSION}
          {hasUpdate && <ArrowUp className={`ml-1 h-3 w-3 ${color}`} />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-w-[260px]">
        {hasUpdate ? (
          <div className="mb-4 text-center">
            New {checkUpdate.data?.updateType} version:{" "}
            {checkUpdate.data?.latestRelease}
          </div>
        ) : !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION ? (
          <div className="mb-4 text-center">This is the latest release</div>
        ) : null}
        <div className="flex flex-col gap-2">
          <Button size="sm" variant="secondary" asChild>
            <Link
              href="https://github.com/langfuse/langfuse/releases"
              target="_blank"
            >
              GitHub Releases
            </Link>
          </Button>
          <Button size="sm" variant="secondary" asChild>
            <Link href="https://langfuse.com/changelog" target="_blank">
              Changelog
            </Link>
          </Button>
          {hasUpdate && (
            <Button size="sm">
              <Link
                href="https://langfuse.com/docs/deployment/self-host#update"
                target="_blank"
              >
                Update
              </Link>
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
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
