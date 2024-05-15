import { AlertTriangle, Check } from "lucide-react";

import { VERSION } from "@/src/constants";
import { env } from "@/src/env.mjs";
import { cn } from "@/src/utils/tailwind";

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
          "flex items-center gap-2 self-stretch rounded-md px-3 py-2 text-xs ring-1 lg:-mx-2",
          env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "STAGING"
            ? "bg-light-blue text-dark-blue ring-dark-blue"
            : env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "DEV"
              ? "bg-light-green text-dark-green ring-dark-green"
              : "bg-light-red text-dark-red ring-dark-red",
        )}
      >
        {env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "DEV" ? (
          <Check size={16} />
        ) : (
          <AlertTriangle size={16} />
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
          size === "sm" ? "text-sm" : "text-xl",
        )}
      >
        Langfuse
      </span>
      {version && (
        <a
          href="https://github.com/langfuse/langfuse/releases"
          target="_blank"
          rel="noopener"
          title="View releases on GitHub"
          className="ml-2 text-xs text-muted-foreground"
        >
          {VERSION}
        </a>
      )}
    </div>
  </div>
);
