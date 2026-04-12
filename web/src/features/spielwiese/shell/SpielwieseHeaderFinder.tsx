"use client";

import { Search } from "lucide-react";
import type { RefObject } from "react";
import { cn } from "@/src/utils/tailwind";
import type { SpielwieseDashboardVM } from "../types/dashboard";
import type { SpielwieseShellVM } from "../types/shell";
import { SpielwieseHeaderFinderPanel } from "./SpielwieseHeaderFinderPanel";
import { FinderShortcut } from "./spielwieseHeaderFinderPrimitives";
import { useSpielwieseHeaderFinderMotion } from "./useSpielwieseHeaderFinderMotion";
import { useSpielwieseHeaderFinderState } from "./useSpielwieseHeaderFinderState";

type FinderTriggerVariant = "header" | "sidebar";

export type SpielwieseHeaderFinderProps = {
  breadcrumb: SpielwieseDashboardVM["header"]["breadcrumb"];
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
  pageId: SpielwieseDashboardVM["pageId"];
  shell: SpielwieseShellVM;
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
          ? "rounded-[10px] bg-white/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] outline-black/5"
          : "rounded-full bg-white/72 outline-black/6 md:rounded",
      )}
      data-bg-layer="true"
      ref={backgroundRef}
    />
  );
}

function FinderTriggerShortcut({
  shortcutRef,
  variant,
}: {
  shortcutRef: RefObject<HTMLElement | null>;
  variant: FinderTriggerVariant;
}) {
  return (
    <span
      className={cn(
        variant === "sidebar"
          ? "grid size-7 place-content-center pr-1"
          : "hidden size-8 place-content-center pr-0.5 md:grid",
      )}
    >
      <FinderShortcut
        className={cn(
          "text-foreground/48 border-black/8 bg-white/76 shadow-none",
          variant === "sidebar" && "h-5 rounded-[0.45rem] bg-white/84",
        )}
        label="F"
        shortcutRef={shortcutRef}
      />
    </span>
  );
}

function getFinderTriggerClassName({
  isOpen,
  variant,
}: {
  isOpen: boolean;
  variant: FinderTriggerVariant;
}) {
  return cn(
    "relative z-[calc(var(--header-zindex)_+_1)] h-8 w-full cursor-pointer overflow-visible border-0 bg-transparent p-0 text-left [webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-[3px]",
    variant === "sidebar"
      ? "max-w-none rounded-[10px]"
      : "max-w-[21rem] rounded-full md:cursor-text md:rounded",
    isOpen ? "invisible" : "pointer-events-auto",
  );
}

function FinderTriggerContent({
  iconRef,
  placeholderRef,
  shortcutRef,
  variant,
}: {
  iconRef: RefObject<SVGSVGElement | null>;
  placeholderRef: RefObject<HTMLSpanElement | null>;
  shortcutRef: RefObject<HTMLElement | null>;
  variant: FinderTriggerVariant;
}) {
  return (
    <span
      className={cn(
        "relative flex flex-row items-center",
        variant === "sidebar" && "px-0.5",
      )}
    >
      <span
        className={cn(
          "grid size-8 shrink-0 place-content-center",
          variant === "sidebar" ? "pl-2.5" : "pl-0.5",
        )}
        data-search-icon="true"
      >
        <Search className="text-foreground/62 size-[0.9375rem]" ref={iconRef} />
      </span>
      <span
        className={cn(
          "text-foreground/52 min-w-0 flex-1 truncate text-[13px]",
          variant === "sidebar" ? "flex pl-2.5" : "hidden pl-0.5 md:flex",
        )}
        data-placeholder="true"
        ref={placeholderRef}
      >
        Find…
      </span>
      <FinderTriggerShortcut shortcutRef={shortcutRef} variant={variant} />
    </span>
  );
}

function FinderTrigger({
  backgroundRef,
  iconRef,
  isOpen,
  onOpen,
  placeholderRef,
  shortcutRef,
  triggerRef,
  variant,
}: {
  backgroundRef: RefObject<HTMLSpanElement | null>;
  iconRef: RefObject<SVGSVGElement | null>;
  isOpen: boolean;
  onOpen: () => void;
  placeholderRef: RefObject<HTMLSpanElement | null>;
  shortcutRef: RefObject<HTMLElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  variant: FinderTriggerVariant;
}) {
  return (
    <button
      aria-controls="spielwiese-header-finder-panel"
      aria-expanded={isOpen}
      aria-label="Open workspace finder"
      className={getFinderTriggerClassName({ isOpen, variant })}
      data-testid="spielwiese-header-finder-trigger"
      onClick={onOpen}
      ref={triggerRef}
      tabIndex={isOpen ? -1 : 0}
      type="button"
    >
      <FinderTriggerBackground
        backgroundRef={backgroundRef}
        variant={variant}
      />
      <FinderTriggerContent
        iconRef={iconRef}
        placeholderRef={placeholderRef}
        shortcutRef={shortcutRef}
        variant={variant}
      />
    </button>
  );
}

export function SpielwieseHeaderFinder({
  breadcrumb,
  isOpen,
  onClose,
  onOpen,
  pageId,
  shell,
  variant = "header",
}: SpielwieseHeaderFinderProps) {
  const motion = useSpielwieseHeaderFinderMotion({ onClose });
  const finderState = useSpielwieseHeaderFinderState({
    breadcrumb,
    onClose: motion.requestClose,
    pageId,
    shell,
  });

  return (
    <div
      className={cn(
        "relative flex min-w-0 items-center",
        variant === "sidebar"
          ? "w-full justify-start"
          : "h-full justify-center",
      )}
    >
      <FinderTrigger
        backgroundRef={motion.triggerBackgroundRef}
        iconRef={motion.triggerIconRef}
        isOpen={isOpen}
        onOpen={onOpen}
        placeholderRef={motion.triggerPlaceholderRef}
        shortcutRef={motion.triggerShortcutRef}
        triggerRef={motion.triggerRef}
        variant={variant}
      />
      {isOpen ? (
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
      ) : null}
    </div>
  );
}
