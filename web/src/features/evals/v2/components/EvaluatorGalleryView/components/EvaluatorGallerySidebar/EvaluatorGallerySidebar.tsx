import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";
import { getGalleryCategoryPresentation } from "@/src/features/evals/v2/fns/templateGallery/galleryCategoryPresentation";
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
                ? "hover:bg-secondary"
                : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onSelectSection(item.key)}
          >
            <Icon className={cn("mr-2 h-3.5 w-3.5 shrink-0", iconClassName)} />
            <span className="truncate" title={item.label}>
              {item.label}
            </span>
            {item.count !== undefined ? (
              <span className="text-muted-foreground ml-auto font-mono text-xs tabular-nums">
                {item.count}
              </span>
            ) : null}
          </Button>
        );
      })}
    </nav>
  );
}
