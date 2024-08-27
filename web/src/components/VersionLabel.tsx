import {
  BadgeCheck,
  Github,
  HardDriveDownload,
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
import { useIsEeEnabled } from "@/src/ee/utils/useIsEeEnabled";
import { env } from "@/src/env.mjs";

export const VersionLabel = ({ className }: { className?: string }) => {
  const checkUpdate = api.public.checkUpdate.useQuery(undefined, {
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION, // do not check for updates on Langfuse Cloud
    onError: (error) => console.error("checkUpdate error", error), // do not render default error message
  });
  const isEeVersion = useIsEeEnabled();

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
