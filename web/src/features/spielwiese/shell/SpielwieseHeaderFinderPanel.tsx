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
      className="border-border/70 bg-background absolute -inset-px origin-top-left rounded-[1.25rem] border shadow-[0_20px_48px_-24px_rgba(15,23,42,0.45)]"
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
      className="border-border/70 relative flex items-center border-b"
      ref={searchFieldRef}
    >
      <span
        className="grid size-12 shrink-0 place-content-center"
        data-search-icon="true"
      >
        <Search className="text-foreground size-4" />
      </span>
      <Input
        aria-label="Find in workspace"
        autoFocus
        className="h-12 flex-1 border-0 bg-transparent px-0 py-4 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0"
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={onInputKeyDown}
        placeholder="Find…"
        ref={inputRef}
        value={query}
      />
      <button
        aria-label="Close finder"
        className="grid size-12 shrink-0 place-content-center bg-transparent outline-none"
        onClick={onClose}
        type="button"
      >
        <span className="hidden sm:block">
          <FinderShortcut label="Esc" shortcutRef={shortcutRef} />
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
          : "relative z-10 flex w-full max-w-[24rem] flex-col self-start"
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
      {children}
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
