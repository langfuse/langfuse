import { cn } from "@/src/utils/tailwind";
import Link from "next/link";
import { EnvLabel } from "./EnvLabel";
import { VersionLabel } from "./VersionLabel";

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
    {showEnvLabel && <EnvLabel />}
    {/* Langfuse Logo */}
    <div className="flex items-center">
      <Link href="/" className="flex items-center">
        <LangfuseIcon size={size === "sm" ? 16 : 20} />
        <span
          className={cn(
            "ml-2 font-mono font-semibold",
            size === "sm" ? "text-sm" : "text-xl",
          )}
        >
          Langfuse
        </span>
      </Link>
      {version && <VersionLabel className="ml-2" />}
    </div>
  </div>
);
