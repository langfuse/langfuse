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

type SpielwieseHeaderFinderProps = {
  breadcrumb: SpielwieseDashboardVM["header"]["breadcrumb"];
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
  pageId: SpielwieseDashboardVM["pageId"];
  shell: SpielwieseShellVM;
};

function FinderTriggerBackground({
  backgroundRef,
}: {
  backgroundRef: RefObject<HTMLSpanElement | null>;
}) {
  return (
    <span
      className="absolute inset-0 origin-top-left rounded-full bg-white/[0.05] outline outline-1 outline-white/8 md:rounded"
      data-bg-layer="true"
      ref={backgroundRef}
    />
  );
}

function FinderTriggerShortcut({
  shortcutRef,
}: {
  shortcutRef: RefObject<HTMLElement | null>;
}) {
  return (
    <span className="hidden size-8 place-content-center pr-0.5 md:grid">
      <FinderShortcut
        className="border-white/10 bg-white/[0.06] text-white/58 shadow-none"
        label="F"
        shortcutRef={shortcutRef}
      />
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
}: {
  backgroundRef: RefObject<HTMLSpanElement | null>;
  iconRef: RefObject<SVGSVGElement | null>;
  isOpen: boolean;
  onOpen: () => void;
  placeholderRef: RefObject<HTMLSpanElement | null>;
  shortcutRef: RefObject<HTMLElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      aria-controls="spielwiese-header-finder-panel"
      aria-expanded={isOpen}
      aria-label="Open workspace finder"
      className={cn(
        "relative z-[calc(var(--header-zindex)_+_1)] h-8 w-full max-w-[21rem] cursor-pointer overflow-visible rounded-full border-0 bg-transparent p-0 text-left [webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-[3px] md:cursor-text md:rounded",
        isOpen ? "invisible" : "pointer-events-auto",
      )}
      data-testid="spielwiese-header-finder-trigger"
      onClick={onOpen}
      ref={triggerRef}
      tabIndex={isOpen ? -1 : 0}
      type="button"
    >
      <FinderTriggerBackground backgroundRef={backgroundRef} />
      <span className="relative flex flex-row items-center">
        <span
          className="grid size-8 shrink-0 place-content-center pl-0.5"
          data-search-icon="true"
        >
          <Search className="size-[0.9375rem] text-white/70" ref={iconRef} />
        </span>
        <span
          className="hidden min-w-0 flex-1 truncate pl-0.5 text-[13px] text-white/60 md:flex"
          data-placeholder="true"
          ref={placeholderRef}
        >
          Find…
        </span>
        <FinderTriggerShortcut shortcutRef={shortcutRef} />
      </span>
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
}: SpielwieseHeaderFinderProps) {
  const motion = useSpielwieseHeaderFinderMotion({ onClose });
  const finderState = useSpielwieseHeaderFinderState({
    breadcrumb,
    onClose: motion.requestClose,
    pageId,
    shell,
  });

  return (
    <div className="relative flex h-full min-w-0 items-center justify-center">
      <FinderTrigger
        backgroundRef={motion.triggerBackgroundRef}
        iconRef={motion.triggerIconRef}
        isOpen={isOpen}
        onOpen={onOpen}
        placeholderRef={motion.triggerPlaceholderRef}
        shortcutRef={motion.triggerShortcutRef}
        triggerRef={motion.triggerRef}
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
        />
      ) : null}
    </div>
  );
}
