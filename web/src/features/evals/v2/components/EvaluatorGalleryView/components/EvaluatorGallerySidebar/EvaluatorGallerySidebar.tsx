import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { cn } from "@/src/utils/tailwind";
import { EVALUATOR_GALLERY_CATEGORY_DOT_CLASS } from "@/src/features/evals/v2/constants/evaluatorGallery";
import type { GalleryNavigationItem } from "@/src/features/evals/v2/types/templateGallery";

export function EvaluatorGallerySidebar({
  items,
  activeSection,
  onSelectSection,
}: {
  items: GalleryNavigationItem[];
  activeSection: string | null;
  onSelectSection: (key: string) => void;
}) {
  return (
    <nav className="flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r p-4">
      <div className="text-muted-foreground px-3 pb-2 text-xs font-bold tracking-wide uppercase">
        Browse
      </div>
      {items.map((item) => {
        const isActive = (activeSection ?? items[0]?.key) === item.key;
        const dotClass = EVALUATOR_GALLERY_CATEGORY_DOT_CLASS[item.key];

        return (
          <Button
            key={item.key}
            type="button"
            variant={isActive ? "secondary" : "ghost"}
            className={cn(
              "font-regular h-8 justify-start px-3",
              isActive
                ? "hover:bg-secondary"
                : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onSelectSection(item.key)}
          >
            {dotClass ? (
              <span
                className={cn("mr-2 h-2 w-2 shrink-0 rounded-full", dotClass)}
              />
            ) : null}
            <span className="truncate" title={item.label}>
              {item.label}
            </span>
            {item.count !== undefined ? (
              <Badge
                variant="secondary"
                size="sm"
                className="text-muted-foreground font-regular ml-auto font-mono tabular-nums"
              >
                {item.count}
              </Badge>
            ) : null}
          </Button>
        );
      })}
    </nav>
  );
}
