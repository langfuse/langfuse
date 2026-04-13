"use client";

import { FileText } from "lucide-react";
import type { RefObject } from "react";
import { cn } from "@/src/utils/tailwind";
import type { FinderItem } from "./spielwieseHeaderFinderData";

function FinderItemIcon({ item }: { item: FinderItem }) {
  const Icon = item.icon ?? FileText;

  if (item.emoji) {
    return <span className="text-sm leading-none">{item.emoji}</span>;
  }

  return <Icon className="size-4" />;
}

function FinderEmptyState({ query }: { query: string }) {
  return (
    <div className="text-foreground/48 flex h-full min-h-[14rem] items-center justify-center px-6 text-[0.875rem] leading-5">
      No matches for “{query}”.
    </div>
  );
}

function FinderResultButton({
  active,
  index,
  item,
  onHoverItem,
  onSelectItem,
}: {
  active: boolean;
  index: number;
  item: FinderItem;
  onHoverItem: (index: number) => void;
  onSelectItem: (item: FinderItem) => void;
}) {
  return (
    <button
      className={cn(
        "relative z-10 flex h-[2.875rem] flex-none flex-row items-center rounded-[0.8rem] border border-transparent px-0 text-left transition-colors outline-none",
        active
          ? "text-foreground"
          : "text-foreground/84 hover:bg-black/[0.035]",
      )}
      data-testid="spielwiese-header-finder-result"
      data-index={index}
      onClick={() => onSelectItem(item)}
      onMouseEnter={() => onHoverItem(index)}
      type="button"
    >
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-content-center"
      >
        <span className="relative flex size-7 items-center justify-center rounded-[9px] border border-black/5 bg-[#F8F8F8]">
          <FinderItemIcon item={item} />
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col overflow-hidden pr-3 select-none">
        <span className="truncate text-[0.8125rem] leading-4.5 font-medium tracking-[-0.01em]">
          <strong>{item.label}</strong>
        </span>
        <span className="truncate text-[0.8125rem] leading-4 text-black/48">
          {item.description}
        </span>
      </span>
    </button>
  );
}

function HeaderFinderResults({
  activeIndex,
  items,
  onHoverItem,
  onSelectItem,
  query,
}: {
  activeIndex: number;
  items: FinderItem[];
  onHoverItem: (index: number) => void;
  onSelectItem: (item: FinderItem) => void;
  query: string;
}) {
  if (items.length === 0) {
    return <FinderEmptyState query={query} />;
  }

  return (
    <div className="relative flex flex-col gap-0.5 p-1.5">
      <div
        className="pointer-events-none absolute inset-x-1.5 top-1.5 h-[2.875rem] rounded-[0.8rem] border border-black/4 bg-[#F3F3F4] transition-transform duration-100"
        style={{ transform: `translateY(${activeIndex * 3}rem)` }}
      />
      {items.map((item, index) => (
        <FinderResultButton
          active={activeIndex === index}
          index={index}
          key={item.id}
          item={item}
          onHoverItem={onHoverItem}
          onSelectItem={onSelectItem}
        />
      ))}
    </div>
  );
}

export function FinderResultsViewport({
  activeIndex,
  items,
  onHoverItem,
  onSelectItem,
  panelResultsRef,
  query,
}: {
  activeIndex: number;
  items: FinderItem[];
  onHoverItem: (index: number) => void;
  onSelectItem: (item: FinderItem) => void;
  panelResultsRef: RefObject<HTMLDivElement | null>;
  query: string;
}) {
  return (
    <div
      className="relative h-[18.5rem] overflow-x-clip overflow-y-auto pb-1 md:overflow-y-clip"
      data-results-list="true"
      ref={panelResultsRef}
    >
      <HeaderFinderResults
        activeIndex={activeIndex}
        items={items}
        onHoverItem={onHoverItem}
        onSelectItem={onSelectItem}
        query={query}
      />
    </div>
  );
}
