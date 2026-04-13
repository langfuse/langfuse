"use client";

import { Search, X } from "lucide-react";
import type { KeyboardEvent, ReactNode, Ref, RefObject } from "react";
import { Input } from "../ui/input";
import { FinderResultsViewport } from "./SpielwieseHeaderFinderResults";
import type { FinderItem } from "./spielwieseHeaderFinderData";
import { FinderShortcut } from "./spielwieseHeaderFinderPrimitives";

type FinderPanelVariant = "header" | "sidebar";

type FinderPanelSurfaceProps = {
  activeIndex: number;
  backgroundRef: RefObject<HTMLDivElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
  items: FinderItem[];
  onClose: () => void;
  onHoverItem: (index: number) => void;
  onInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onQueryChange: (value: string) => void;
  onSelectItem: (item: FinderItem) => void;
  panelResultsRef: RefObject<HTMLDivElement | null>;
  panelSearchFieldRef: RefObject<HTMLLabelElement | null>;
  panelShortcutRef: RefObject<HTMLElement | null>;
  panelSurfaceRef: Ref<HTMLDivElement>;
  query: string;
  variant: FinderPanelVariant;
};

function FinderPanelBackground({
  backgroundRef,
}: {
  backgroundRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      className="absolute -inset-px origin-top-left rounded-[1.25rem] border border-[rgba(15,23,42,0.08)] bg-[#F1F2F2] shadow-[0_20px_48px_-24px_rgba(15,23,42,0.32),0_10px_18px_-10px_rgba(15,23,42,0.14)]"
      data-bg-layer="true"
      ref={backgroundRef}
    />
  );
}

function HeaderFinderSearchField({
  inputRef,
  onClose,
  onInputKeyDown,
  onQueryChange,
  searchFieldRef,
  shortcutRef,
  query,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onQueryChange: (value: string) => void;
  searchFieldRef: RefObject<HTMLLabelElement | null>;
  shortcutRef: RefObject<HTMLElement | null>;
  query: string;
}) {
  return (
    <label
      className="relative flex items-center gap-2 border-b border-black/5 px-2 py-2"
      data-testid="spielwiese-header-finder-search-field"
      ref={searchFieldRef}
    >
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-[9px] border border-black/5 bg-[#F3F3F4]"
        data-search-icon="true"
      >
        <Search className="text-foreground/62 size-[0.9375rem]" />
      </span>
      <Input
        aria-label="Find in workspace"
        autoFocus
        className="placeholder:text-foreground/36 h-7 flex-1 border-0 bg-transparent px-0 py-0 text-[0.875rem] leading-5 shadow-none focus-visible:border-transparent focus-visible:ring-0"
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={onInputKeyDown}
        placeholder="Find…"
        ref={inputRef}
        value={query}
      />
      <button
        aria-label="Close finder"
        className="text-foreground/56 inline-flex h-7 shrink-0 items-center justify-center rounded-[9px] px-2 text-[0.75rem] transition-colors outline-none hover:bg-black/4 focus-visible:bg-black/4"
        onClick={onClose}
        type="button"
      >
        <span className="hidden sm:block">
          <FinderShortcut
            className="text-foreground/44 border-black/6 bg-[#F8F8F8] shadow-none"
            label="Esc"
            shortcutRef={shortcutRef}
          />
        </span>
        <X className="text-foreground size-4 sm:hidden" />
      </button>
    </label>
  );
}

function FinderPanelFrame({
  backgroundRef,
  children,
  onClose,
  panelSurfaceRef,
  variant,
}: {
  backgroundRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
  onClose: () => void;
  panelSurfaceRef: Ref<HTMLDivElement>;
  variant: FinderPanelVariant;
}) {
  return (
    <div
      className={
        variant === "sidebar"
          ? "relative z-10 flex w-full max-w-none flex-col"
          : "relative z-10 flex w-full max-w-[26rem] flex-col self-start"
      }
      data-testid="spielwiese-header-finder-panel"
      id="spielwiese-header-finder-panel"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          onClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
      ref={panelSurfaceRef}
      role="dialog"
    >
      <FinderPanelBackground backgroundRef={backgroundRef} />
      <div className="relative overflow-hidden rounded-[1.05rem] border border-black/5 bg-[rgba(251,251,251,0.96)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
        {children}
      </div>
    </div>
  );
}

function FinderPanelSurface({
  activeIndex,
  backgroundRef,
  inputRef,
  items,
  onClose,
  onHoverItem,
  onInputKeyDown,
  onQueryChange,
  onSelectItem,
  panelResultsRef,
  panelSearchFieldRef,
  panelShortcutRef,
  panelSurfaceRef,
  query,
  variant,
}: FinderPanelSurfaceProps) {
  return (
    <FinderPanelFrame
      backgroundRef={backgroundRef}
      onClose={onClose}
      panelSurfaceRef={panelSurfaceRef}
      variant={variant}
    >
      <HeaderFinderSearchField
        inputRef={inputRef}
        onClose={onClose}
        onInputKeyDown={onInputKeyDown}
        onQueryChange={onQueryChange}
        searchFieldRef={panelSearchFieldRef}
        shortcutRef={panelShortcutRef}
        query={query}
      />
      <FinderResultsViewport
        activeIndex={activeIndex}
        items={items}
        onHoverItem={onHoverItem}
        onSelectItem={onSelectItem}
        panelResultsRef={panelResultsRef}
        query={query}
      />
    </FinderPanelFrame>
  );
}

function SidebarFinderPanelContainer(props: FinderPanelSurfaceProps) {
  return (
    <div
      className="absolute inset-x-0 top-0 z-40"
      data-testid="spielwiese-header-finder-container"
    >
      <FinderPanelSurface {...props} />
    </div>
  );
}

function HeaderFinderPanelContainer(props: FinderPanelSurfaceProps) {
  return (
    <div
      className="fixed inset-x-0 top-[var(--banner-offset)] bottom-0 z-40 flex justify-center px-3 pt-2 sm:px-5 sm:pt-3"
      data-testid="spielwiese-header-finder-container"
    >
      <button
        aria-label="Dismiss finder"
        className="absolute inset-0 bg-transparent"
        onClick={props.onClose}
        tabIndex={-1}
        type="button"
      />
      <FinderPanelSurface {...props} />
    </div>
  );
}

export function SpielwieseHeaderFinderPanel({
  activeIndex,
  inputRef,
  items,
  onClose,
  onHoverItem,
  onInputKeyDown,
  onQueryChange,
  onSelectItem,
  panelBackgroundRef,
  panelResultsRef,
  panelSearchFieldRef,
  panelShortcutRef,
  panelSurfaceRef,
  query,
  variant = "header",
}: {
  activeIndex: number;
  inputRef: RefObject<HTMLInputElement | null>;
  items: FinderItem[];
  onClose: () => void;
  onHoverItem: (index: number) => void;
  onInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onQueryChange: (value: string) => void;
  onSelectItem: (item: FinderItem) => void;
  panelBackgroundRef: RefObject<HTMLDivElement | null>;
  panelResultsRef: RefObject<HTMLDivElement | null>;
  panelSearchFieldRef: RefObject<HTMLLabelElement | null>;
  panelShortcutRef: RefObject<HTMLElement | null>;
  panelSurfaceRef: Ref<HTMLDivElement>;
  query: string;
  variant?: FinderPanelVariant;
}) {
  const surfaceProps = {
    activeIndex,
    backgroundRef: panelBackgroundRef,
    inputRef,
    items,
    onClose,
    onHoverItem,
    onInputKeyDown,
    onQueryChange,
    onSelectItem,
    panelResultsRef,
    panelSearchFieldRef,
    panelShortcutRef,
    panelSurfaceRef,
    query,
    variant,
  } satisfies FinderPanelSurfaceProps;

  return variant === "sidebar" ? (
    <SidebarFinderPanelContainer {...surfaceProps} />
  ) : (
    <HeaderFinderPanelContainer {...surfaceProps} />
  );
}
