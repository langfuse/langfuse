import { cn } from "@/src/utils/tailwind";
import Link from "next/link";
import { VersionLabel } from "./VersionLabel";
import { env } from "@/src/env.mjs";
import { useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";
import { PlusIcon } from "lucide-react";

export const LangfuseIcon = ({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src={`${env.NEXT_PUBLIC_BASE_PATH ?? ""}/langfuse-logo.png${env.NEXT_PUBLIC_BUILD_ID ? `?v=${encodeURIComponent(env.NEXT_PUBLIC_BUILD_ID)}` : ""}`}
    width={size}
    height={size}
    alt="ai-eval Icon"
    className={className}
  />
);

const LangfuseLogotypeOrCustomized = ({ size }: { size: "sm" | "xl" }) => {
  const uiCustomization = useUiCustomization();

  if (uiCustomization?.logoLightModeHref && uiCustomization?.logoDarkModeHref) {
    // logo is a url, maximum aspect ratio of 1:3 needs to be supported according to docs
    return (
      <div className="flex items-center gap-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={uiCustomization.logoLightModeHref}
          alt="ai-eval Logo"
          className={cn(
            "group-data-[collapsible=icon]:hidden dark:hidden",
            size === "sm" ? "max-h-4 max-w-14" : "max-h-5 max-w-16",
          )}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={uiCustomization.logoDarkModeHref}
          alt="ai-eval Logo"
          className={cn(
            "hidden group-data-[collapsible=icon]:hidden dark:block",
            size === "sm" ? "max-h-4 max-w-14" : "max-h-5 max-w-16",
          )}
        />
        <PlusIcon
          size={size === "sm" ? 8 : 12}
          className="group-data-[collapsible=icon]:hidden"
        />
        <LangfuseIcon size={size === "sm" ? 16 : 20} />
      </div>
    );
  }

  return (
    <div className="flex items-center">
      <LangfuseIcon size={size === "sm" ? 16 : 20} />
      <span
        className={cn(
          "ml-2 whitespace-nowrap font-mono font-semibold leading-none group-data-[collapsible=icon]:hidden",
          size === "sm" ? "text-xs" : "text-lg",
        )}
      >
        ai-eval
      </span>
    </div>
  );
};

export const LangfuseLogo = ({
  className,
  size = "sm",
  version = false,
}: {
  size?: "sm" | "xl";
  className?: string;
  version?: boolean;
}) => {
  return (
    <div
      className={cn(
        "-mt-2 ml-1 flex flex-wrap gap-4 lg:flex-col lg:items-start",
        className,
      )}
    >
      {/* ai-eval Logo */}
      <div className="flex items-center">
        <Link href="/" className="flex items-center">
          <LangfuseLogotypeOrCustomized size={size} />
        </Link>
        {version && (
          <VersionLabel className="ml-2 group-data-[collapsible=icon]:hidden" />
        )}
      </div>
    </div>
  );
};
