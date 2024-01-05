import { VERSION } from "@/src/constants/VERSION";
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
    src="/icon256.png"
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
}: {
  size?: "sm" | "xl";
  className?: string;
  version?: boolean;
}) => (
  <div className={cn("flex items-center", className)}>
    <LangfuseIcon size={size === "sm" ? 16 : 20} />
    <span
      className={cn(
        "font-mono font-semibold",
        size === "sm" ? "ml-2 text-sm" : "ml-3 text-xl",
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
        className="ml-2 text-xs text-gray-400"
      >
        {VERSION}
      </a>
    )}
  </div>
);
