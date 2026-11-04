import { LangfuseIcon } from "@/src/components/design-system/LangfuseIcon/LangfuseIcon";
import { env } from "@/src/env.mjs";
import { cn } from "@/src/utils/tailwind";
import { PlusIcon } from "@langfuse/icons";

export const LangfuseLogo = ({
  logoLightModeHref,
  logoDarkModeHref,
}: {
  logoLightModeHref?: string;
  logoDarkModeHref?: string;
}) => {
  if (logoLightModeHref && logoDarkModeHref) {
    // logo is a url, maximum aspect ratio of 1:3 needs to be supported according to docs
    return (
      <div className="flex items-center gap-1">
        <img
          src={logoLightModeHref}
          alt="Langfuse Logo"
          className={cn(
            "group-data-[collapsible=icon]:hidden dark:hidden",
            "max-h-4 max-w-14",
          )}
        />
        <img
          src={logoDarkModeHref}
          alt="Langfuse Logo"
          className={cn(
            "hidden group-data-[collapsible=icon]:hidden dark:block",
            "max-h-4 max-w-14",
          )}
        />
        <PlusIcon
          size="sm"
          __rawClassName="group-data-[collapsible=icon]:hidden"
        />
        <LangfuseIcon size={16} />
      </div>
    );
  }

  return (
    <div className="flex items-center">
      <img
        className="-ml-1 h-6 max-w-24 group-data-[collapsible=icon]:hidden dark:hidden"
        src={`${env.NEXT_PUBLIC_BASE_PATH ?? ""}/langfuse-by-clickhouse.svg`}
        alt="Langfuse by ClickHouse"
      />
      <img
        className="-ml-1 hidden h-6 max-w-24 group-data-[collapsible=icon]:hidden dark:block"
        src={`${env.NEXT_PUBLIC_BASE_PATH ?? ""}/langfuse-by-clickhouse-white.svg`}
        alt="Langfuse by ClickHouse"
      />
      <div className="hidden scale-120 group-data-[collapsible=icon]:block">
        <LangfuseIcon size={28} />
      </div>
    </div>
  );
};
