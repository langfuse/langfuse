import { Button } from "@/src/components/ui/button";
import { SearchInput } from "@/src/components/design-system/SearchInput/SearchInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { cn } from "@/src/utils/tailwind";
import type { GalleryNavigationItem } from "@/src/features/evals/v2/types/templateGallery";

type EvaluatorGallerySidebarProps = {
  items: GalleryNavigationItem[];
  activeSection: string | null;
  onSelectSection: (key: string) => void;
  search: string;
  onSearchChange: (search: string) => void;
};

export function EvaluatorGallerySidebar({
  items,
  activeSection,
  onSelectSection,
  search,
  onSearchChange,
}: EvaluatorGallerySidebarProps) {
  const selectedSection = activeSection ?? items[0]?.key;
  const selectedItem = items.find((item) => item.key === selectedSection);

  return (
    <>
      <nav
        aria-label="Browse categories"
        className="hidden w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r p-4 @2xl:flex"
      >
        <div className="pb-2">
          <GallerySearch search={search} onSearchChange={onSearchChange} />
        </div>
        {items.map((item) => {
          const isActive = selectedSection === item.key;

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
        <GallerySearch search={search} onSearchChange={onSearchChange} />
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

type GallerySearchProps = {
  search: string;
  onSearchChange: (search: string) => void;
};

function GallerySearch({ search, onSearchChange }: GallerySearchProps) {
  return (
    <SearchInput
      value={search}
      onChange={onSearchChange}
      onSubmit={onSearchChange}
      placeholder="Search templates"
    />
  );
}
