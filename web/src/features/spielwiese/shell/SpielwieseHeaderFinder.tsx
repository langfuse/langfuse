"use client";

import { Search } from "lucide-react";
import type { RefObject } from "react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseDashboardVM } from "../types/dashboard";
import type { SpielwieseShellVM } from "../types/shell";
import { sidebarMenuButtonVariants } from "../ui/sidebar";
import { SpielwieseHeaderFinderPanel } from "./SpielwieseHeaderFinderPanel";
import { FinderShortcut } from "./spielwieseHeaderFinderPrimitives";
import { SpielwieseSidebarShortcut } from "./SpielwieseSidebarShortcut";
import { useSpielwieseHeaderFinderMotion } from "./useSpielwieseHeaderFinderMotion";
import { useSpielwieseHeaderFinderState } from "./useSpielwieseHeaderFinderState";

type FinderTriggerVariant = "header" | "sidebar";

export type SpielwieseHeaderFinderProps = {
  active?: boolean;
  breadcrumb: SpielwieseDashboardVM["header"]["breadcrumb"];
  disabled?: boolean;
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
  pageId: SpielwieseDashboardVM["pageId"];
  shell: SpielwieseShellVM;
  shortcutLabel?: string;
  variant?: FinderTriggerVariant;
};

function FinderTriggerBackground({
  backgroundRef,
  variant,
}: {
  backgroundRef: RefObject<HTMLSpanElement | null>;
  variant: FinderTriggerVariant;
}) {
  return (
    <span
      className={cn(
        "absolute inset-0 origin-top-left outline outline-1",
        variant === "sidebar"
          ? "rounded-[10px] bg-transparent shadow-none outline-transparent"
          : "rounded-full bg-white/72 outline-black/6 md:rounded",
      )}
      data-bg-layer="true"
      ref={backgroundRef}
    />
  );
}

function FinderTriggerShortcut({
  shortcutRef,
  shortcutLabel,
  variant,
}: {
  shortcutRef: RefObject<HTMLElement | null>;
  shortcutLabel?: string;
  variant: FinderTriggerVariant;
}) {
  const label = shortcutLabel ?? "F";

  if (variant === "sidebar") {
    return (
      <SpielwieseSidebarShortcut label={label} shortcutRef={shortcutRef} />
    );
  }

  return (
    <span className="hidden size-8 place-content-center pr-0.5 md:grid">
      <FinderShortcut
        className="text-foreground/48 border-black/8 bg-white/76 shadow-none"
        label={label}
        shortcutRef={shortcutRef}
      />
    </span>
  );
}

function getFinderTriggerClassName({
  active,
  disabled,
  isOpen,
  variant,
}: {
  active: boolean;
  disabled: boolean;
  isOpen: boolean;
  variant: FinderTriggerVariant;
}) {
  return cn(
    "relative z-[calc(var(--header-zindex)_+_1)] h-8 w-full cursor-pointer overflow-visible border-0 bg-transparent p-0 text-left [webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-[3px]",
    variant === "sidebar"
      ? cn(
          "group/sidebar-item max-w-none rounded-[10px] focus-visible:outline-0",
          sidebarMenuButtonVariants({ active, tone: "primary" }),
        )
      : "max-w-[21rem] rounded-full md:cursor-text md:rounded",
    disabled ? "cursor-default" : undefined,
    isOpen ? "invisible" : "pointer-events-auto",
  );
}

// eslint-disable-next-line max-lines-per-function
function FinderTriggerContent({
  iconRef,
  placeholderRef,
  shortcutRef,
  shortcutLabel,
  variant,
}: {
  iconRef: RefObject<SVGSVGElement | null>;
  placeholderRef: RefObject<HTMLSpanElement | null>;
  shortcutRef: RefObject<HTMLElement | null>;
  shortcutLabel?: string;
  variant: FinderTriggerVariant;
}) {
  return (
    <span
      className={cn(
        "relative flex flex-row items-center",
        variant === "sidebar" && "w-full",
      )}
    >
      {variant === "sidebar" ? (
        <>
          <span
            className="grid size-8 shrink-0 place-content-center pl-0.5"
            data-search-icon="true"
          >
            <Search
              className="size-[0.9375rem]"
              data-sidebar-icon="true"
              ref={iconRef}
            />
          </span>
          <span
            className="min-w-0 flex-1 truncate pl-0.5 text-[0.875rem] leading-5"
            data-placeholder="true"
            data-sidebar-label
            ref={placeholderRef}
          >
            Search
          </span>
          <FinderTriggerShortcut
            shortcutLabel={shortcutLabel}
            shortcutRef={shortcutRef}
            variant={variant}
          />
        </>
      ) : (
        <>
          <span
            className="grid size-8 shrink-0 place-content-center pl-0.5"
            data-search-icon="true"
          >
            <Search
              className="text-foreground/62 size-[0.9375rem]"
              ref={iconRef}
            />
          </span>
          <span
            className="text-foreground/52 hidden min-w-0 flex-1 truncate pl-0.5 text-[13px] md:flex"
            data-placeholder="true"
            ref={placeholderRef}
          >
            Find…
          </span>
          <FinderTriggerShortcut
            shortcutLabel={shortcutLabel}
            shortcutRef={shortcutRef}
            variant={variant}
          />
        </>
      )}
    </span>
  );
}

function handleFinderTriggerClick({
  disabled,
  event,
  onOpen,
}: {
  disabled: boolean;
  event: { preventDefault: () => void };
  onOpen: () => void;
}) {
  if (disabled) {
    event.preventDefault();
    return;
  }

  onOpen();
}
function FinderTrigger({
  active,
  backgroundRef,
  disabled,
  iconRef,
  isOpen,
  onOpen,
  placeholderRef,
  shortcutRef,
  shortcutLabel,
  triggerRef,
  variant,
}: {
  active: boolean;
  backgroundRef: RefObject<HTMLSpanElement | null>;
  disabled: boolean;
  iconRef: RefObject<SVGSVGElement | null>;
  isOpen: boolean;
  onOpen: () => void;
  placeholderRef: RefObject<HTMLSpanElement | null>;
  shortcutRef: RefObject<HTMLElement | null>;
  shortcutLabel?: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
  variant: FinderTriggerVariant;
}) {
  return (
    <button
      aria-controls="spielwiese-header-finder-panel"
      aria-disabled={disabled || undefined}
      aria-expanded={isOpen}
      aria-label="Open workspace finder"
      className={getFinderTriggerClassName({
        active,
        disabled,
        isOpen,
        variant,
      })}
      data-testid="spielwiese-header-finder-trigger"
      onClick={(event) => handleFinderTriggerClick({ disabled, event, onOpen })}
      ref={triggerRef}
      tabIndex={isOpen || disabled ? -1 : 0}
      type="button"
    >
      <FinderTriggerBackground
        backgroundRef={backgroundRef}
        variant={variant}
      />
      <FinderTriggerContent
        iconRef={iconRef}
        placeholderRef={placeholderRef}
        shortcutLabel={shortcutLabel}
        shortcutRef={shortcutRef}
        variant={variant}
      />
    </button>
  );
}

export function SpielwieseHeaderFinder({
  active = false,
  breadcrumb,
  disabled = false,
  isOpen,
  onClose,
  onOpen,
  pageId,
  shell,
  shortcutLabel,
  variant = "header",
}: SpielwieseHeaderFinderProps) {
  const motion = useSpielwieseHeaderFinderMotion({ onClose });
  const finderState = useSpielwieseHeaderFinderState({
    breadcrumb,
    onClose: motion.requestClose,
    pageId,
    shell,
  });
  const containerClassName =
    variant === "sidebar" ? "w-full justify-start" : "h-full justify-center";

  return (
    <div
      className={cn("relative flex min-w-0 items-center", containerClassName)}
    >
      <FinderTrigger
        active={active}
        backgroundRef={motion.triggerBackgroundRef}
        disabled={disabled}
        iconRef={motion.triggerIconRef}
        isOpen={isOpen}
        onOpen={onOpen}
        placeholderRef={motion.triggerPlaceholderRef}
        shortcutLabel={shortcutLabel}
        shortcutRef={motion.triggerShortcutRef}
        triggerRef={motion.triggerRef}
        variant={variant}
      />
      {isOpen && (
        <SpielwieseHeaderFinderPanel
          activeIndex={finderState.activeIndex}
          items={finderState.filteredItems}
          inputRef={motion.panelInputRef}
          onClose={finderState.closeFinder}
          onHoverItem={finderState.onHoverItem}
          onInputKeyDown={finderState.onInputKeyDown}
          onQueryChange={finderState.onQueryChange}
          onSelectItem={finderState.onSelectItem}
          panelBackgroundRef={motion.panelBackgroundRef}
          panelResultsRef={motion.panelResultsRef}
          panelSearchFieldRef={motion.panelSearchFieldRef}
          panelShortcutRef={motion.panelShortcutRef}
          panelSurfaceRef={motion.scheduleOpenAnimation}
          query={finderState.query}
          variant={variant}
        />
      )}
    </div>
  );
}
