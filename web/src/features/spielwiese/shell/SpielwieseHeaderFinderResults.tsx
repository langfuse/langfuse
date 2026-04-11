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
    return (
      <div className="text-muted-foreground flex h-full min-h-[14rem] items-center justify-center px-6 text-sm">
        No matches for “{query}”.
      </div>
    );
  }

  return (
    <div className="relative flex flex-col p-1">
      <div
        className="bg-muted/80 pointer-events-none absolute inset-x-1 top-1 h-12 rounded-[0.7rem] transition-transform duration-100"
        style={{ transform: `translateY(${activeIndex * 3}rem)` }}
      />
      {items.map((item, index) => (
        <button
          className={cn(
            "active:bg-muted/80 relative z-10 flex h-12 flex-none flex-row items-center rounded-[0.7rem] p-0 text-left outline-none",
            activeIndex !== index && "hover:bg-muted/35",
          )}
          data-index={index}
          key={item.id}
          onClick={() => onSelectItem(item)}
          onMouseEnter={() => onHoverItem(index)}
          type="button"
        >
          <span
            aria-hidden="true"
            className="grid size-11 shrink-0 place-content-center"
          >
            <span className="relative flex items-center justify-center">
              <FinderItemIcon item={item} />
            </span>
          </span>
          <span className="flex min-w-0 flex-1 flex-col overflow-hidden pr-2 select-none">
            <span className="truncate text-[0.8125rem] leading-4 font-medium">
              <strong>{item.label}</strong>
            </span>
            <span className="text-muted-foreground truncate text-[0.8125rem] leading-4">
              {item.description}
            </span>
          </span>
        </button>
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
      className="relative h-[18.5rem] overflow-x-clip overflow-y-auto md:overflow-y-clip"
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
