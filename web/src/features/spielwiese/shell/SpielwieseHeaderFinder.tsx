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
        "relative z-[calc(var(--header-zindex)_+_1)] h-9 w-full max-w-[22rem] cursor-pointer overflow-visible rounded-full border-0 bg-transparent p-0 text-left [webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-[3px] md:cursor-text md:rounded",
        isOpen ? "invisible" : "pointer-events-auto",
      )}
      data-testid="spielwiese-header-finder-trigger"
      onClick={onOpen}
      ref={triggerRef}
      tabIndex={isOpen ? -1 : 0}
      type="button"
    >
      <span
        className="bg-background outline-border/70 absolute inset-0 origin-top-left rounded-full outline outline-1 md:rounded"
        data-bg-layer="true"
        ref={backgroundRef}
      />
      <span className="relative flex flex-row items-center">
        <span
          className="grid size-9 shrink-0 place-content-center pl-1"
          data-search-icon="true"
        >
          <Search className="text-foreground size-4" ref={iconRef} />
        </span>
        <span
          className="text-muted-foreground hidden min-w-0 flex-1 truncate pl-0.5 text-sm md:flex"
          data-placeholder="true"
          ref={placeholderRef}
        >
          Find…
        </span>
        <span className="hidden size-9 place-content-center pr-1 md:grid">
          <FinderShortcut label="F" shortcutRef={shortcutRef} />
        </span>
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
    <div className="relative flex min-w-0 justify-center">
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
