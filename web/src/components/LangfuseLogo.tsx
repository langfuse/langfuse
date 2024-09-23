import { cn } from "@/src/utils/tailwind";
import Link from "next/link";
import { EnvLabel } from "./EnvLabel";
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
    src={`${env.NEXT_PUBLIC_BASE_PATH ?? ""}/icon.svg`}
    width={size}
    height={size}
    alt="Langfuse Icon"
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
          alt="Langfuse Logo"
          className={cn(
            "dark:hidden",
            size === "sm" ? "max-h-4 max-w-14" : "max-h-5 max-w-16",
          )}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={uiCustomization.logoDarkModeHref}
          alt="Langfuse Logo"
          className={cn(
            "hidden dark:block",
            size === "sm" ? "max-h-4 max-w-14" : "max-h-5 max-w-16",
          )}
        />
        <PlusIcon size={size === "sm" ? 8 : 12} />
        <LangfuseIcon size={size === "sm" ? 16 : 20} />
      </div>
    );
  }

  return (
    <div className="flex items-center">
      <LangfuseIcon size={size === "sm" ? 16 : 20} />
      <span
        className={cn(
          "ml-2 font-mono font-semibold",
          size === "sm" ? "text-sm" : "text-xl",
        )}
      >
        Langfuse
      </span>
    </div>
  );
};

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
}) => {
  return (
    <div
      className={cn(
        "flex flex-wrap gap-4 lg:flex-col lg:items-start",
        className,
      )}
    >
      {/* Environment Labeling for Langfuse Maintainers */}
      {showEnvLabel && <EnvLabel />}
      {/* Langfuse Logo */}
      <div className="flex items-center">
        <Link href="/" className="flex items-center">
          <LangfuseLogotypeOrCustomized size={size} />
        </Link>
        {version && <VersionLabel className="ml-2" />}
      </div>
    </div>
  );
};
