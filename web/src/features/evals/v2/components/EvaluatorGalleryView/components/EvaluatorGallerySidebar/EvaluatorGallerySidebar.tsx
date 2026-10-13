import type { RefObject } from "react";
import { Search } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { cn } from "@/src/utils/tailwind";
import { getGalleryCategoryPresentation } from "@/src/features/evals/v2/fns/templateGallery/galleryCategoryPresentation";
import type { GalleryNavigationItem } from "@/src/features/evals/v2/types/templateGallery";

function GallerySearch({
  search,
  onSearchChange,
  searchInputRef,
}: {
  search: string;
  onSearchChange: (search: string) => void;
  searchInputRef?: RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="relative">
      <Search className="text-muted-foreground icon-base absolute top-1/2 left-2 -translate-y-1/2" />
      <Input
        ref={searchInputRef}
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search templates"
        aria-label="Search templates"
        className="pl-8"
      />
    </div>
  );
}

export function EvaluatorGallerySidebar({
  items,
  activeSection,
  onSelectSection,
  search,
  onSearchChange,
  searchInputRef,
}: {
  items: GalleryNavigationItem[];
  activeSection: string | null;
  onSelectSection: (key: string) => void;
  search: string;
  onSearchChange: (search: string) => void;
  searchInputRef?: RefObject<HTMLInputElement | null>;
}) {
  // Both layouts stay mounted; only the wide one takes the focus ref.
  const searchField = (ref?: RefObject<HTMLInputElement | null>) => (
    <GallerySearch
      search={search}
      onSearchChange={onSearchChange}
      searchInputRef={ref}
    />
  );
  const selectedSection = activeSection ?? items[0]?.key;
  const selectedItem = items.find((item) => item.key === selectedSection);

  return (
    <>
      <nav
        aria-label="Browse categories"
        className="hidden w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r p-4 @2xl:flex"
      >
        <div className="pb-4">{searchField(searchInputRef)}</div>
        <div className="text-muted-foreground px-3 pb-2 text-xs font-bold tracking-wide uppercase">
          Browse
        </div>
        {items.map((item) => {
          const isActive = selectedSection === item.key;
          const { icon: FallbackIcon, iconClassName } =
            getGalleryCategoryPresentation(item.key);
          const Icon = item.icon ?? FallbackIcon;

          return (
            <Button
              key={item.key}
              type="button"
              variant={isActive ? "secondary" : "ghost"}
              className={cn(
                "font-regular h-8 justify-start px-3",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent"
                  : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
              aria-current={isActive ? "page" : undefined}
              onClick={() => onSelectSection(item.key)}
            >
              <Icon className={cn("icon-base mr-2 shrink-0", iconClassName)} />
              <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                <span className="truncate" title={item.label}>
                  {item.label}
                </span>
                {item.count !== undefined ? (
                  <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
                    {item.count}
                  </span>
                ) : null}
              </span>
            </Button>
          );
        })}
      </nav>

      <nav
        aria-label="Browse categories"
        className="flex flex-col gap-2 border-b p-3 @2xl:hidden"
      >
        {searchField()}
        <Select value={selectedSection} onValueChange={onSelectSection}>
          <SelectTrigger aria-label="Browse categories" className="w-full">
            <SelectValue placeholder="Browse categories">
              {selectedItem?.label}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem
                key={item.key}
                value={item.key}
                className="[&>span:last-child]:w-full"
              >
                <span className="flex w-full items-center justify-between gap-3">
                  <span className="truncate" title={item.label}>
                    {item.label}
                  </span>
                  {item.count !== undefined ? (
                    <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
                      {item.count}
                    </span>
                  ) : null}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </nav>
    </>
  );
}
