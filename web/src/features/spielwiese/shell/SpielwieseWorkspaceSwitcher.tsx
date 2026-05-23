import Image from "next/image";
import type { MouseEvent } from "react";
import { ChevronDown } from "lucide-react";
import { getSpielwieseAssetPath } from "../spielwieseAssetPath";
type SpielwieseWorkspaceSwitcherProps = {
  disabled?: boolean;
  name: string;
  variant: "compact" | "sidebar" | "topbar";
};

function SpielwieseWorkspaceMark({ size }: { size: string }) {
  return (
    <span
      className={`inline-flex shrink-0 overflow-hidden rounded-[7px] ${size}`}
    >
      <Image
        alt=""
        className="size-full object-cover"
        draggable={false}
        height={240}
        priority
        src={getSpielwieseAssetPath("/assets/rudel-logo.jpg")}
        unoptimized
        width={240}
      />
    </span>
  );
}

// eslint-disable-next-line max-lines-per-function
export function SpielwieseWorkspaceSwitcher({
  disabled = false,
  name,
  variant,
}: SpielwieseWorkspaceSwitcherProps) {
  const markSizeByVariant = {
    compact: "size-[1.625rem]",
    sidebar: "size-[1.625rem]",
    topbar: "size-6",
  } satisfies Record<SpielwieseWorkspaceSwitcherProps["variant"], string>;
  const markSize = markSizeByVariant[variant];
  const mark = <SpielwieseWorkspaceMark size={markSize} />;
  const disabledProps = disabled
    ? {
        "aria-disabled": "true",
        onClick: (event: MouseEvent<HTMLElement>) => event.preventDefault(),
        tabIndex: -1,
      }
    : undefined;

  if (variant === "compact") {
    return (
      <a
        className={`hover:bg-sidebar-accent inline-flex size-11 items-center justify-center rounded-xl transition-colors ${disabled ? "pointer-events-none cursor-default" : ""}`}
        data-testid="spielwiese-workspace-switcher"
        href="#assistant"
        title={name}
        {...disabledProps}
      >
        <span className="scale-[0.89]">{mark}</span>
      </a>
    );
  }

  if (variant === "topbar") {
    return (
      <a
        className={`ml-px flex h-[calc(var(--spielwiese-header-height)-4px)] max-w-[12rem] min-w-0 items-center gap-2.5 rounded-[10px] pr-2.5 pl-[3px] text-[#242529] ${disabled ? "pointer-events-none cursor-default" : ""}`}
        data-testid="spielwiese-workspace-switcher"
        href="#assistant"
        {...disabledProps}
      >
        {mark}
        <span className="min-w-0 flex-1 truncate text-[0.875rem] leading-5 font-medium tracking-[-0.14px]">
          {name}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-black/[0.55]" />
      </a>
    );
  }

  return (
    <a
      className={`flex h-12 items-center gap-2.5 px-3 pr-12 text-[#242529] transition-[background-color,color] hover:bg-black/[0.03] ${disabled ? "pointer-events-none cursor-default" : ""}`}
      data-testid="spielwiese-workspace-switcher"
      href="#assistant"
      {...disabledProps}
    >
      {mark}
      <span className="min-w-0 flex-1 truncate text-[1rem] leading-5 font-semibold tracking-[-0.32px]">
        {name}
      </span>
      <ChevronDown className="size-3.5 shrink-0 text-black/[0.55]" />
    </a>
  );
}
