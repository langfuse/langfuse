import { useMemo, useRef, useState } from "react";
import { User, X } from "lucide-react";
import { api } from "@/src/utils/api";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/src/components/ui/dialog";
import {
  CATALOG_CATEGORIES,
  getCatalogMeta,
} from "@/src/features/evals/v2/catalog-meta";
import { cn } from "@/src/utils/tailwind";
import { EvaluatorGalleryView } from "./production/gallery/EvaluatorGalleryView";
import type {
  EvaluatorTemplate,
  GalleryNavigationItem,
  GallerySection,
} from "./production/gallery/types";

const CUSTOM_SECTION_KEY = "custom";

interface EvaluatorGalleryDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTemplate: (template: EvaluatorTemplate) => void;
  onCreateFromScratch: (type: "llm" | "code") => void;
}

export function EvaluatorGalleryDialog({
  projectId,
  open,
  onOpenChange,
  onSelectTemplate,
  onCreateFromScratch,
}: EvaluatorGalleryDialogProps) {
  const [search, setSearch] = useState("");
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(),
  );
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const catalog = api.evalsV2.catalog.useQuery(
    { projectId },
    { enabled: open },
  );
  const projectTemplates = api.evalsV2.projectTemplates.useQuery(
    { projectId },
    { enabled: open },
  );
  const query = search.trim().toLowerCase();

  const templatesByCategory = useMemo(() => {
    const grouped = new Map<string, EvaluatorTemplate[]>();
    for (const template of catalog.data ?? []) {
      const meta = getCatalogMeta(template.name);
      if (
        query &&
        !template.name.toLowerCase().includes(query) &&
        !(meta.description ?? "").toLowerCase().includes(query)
      ) {
        continue;
      }
      const existing = grouped.get(meta.category);
      if (existing) existing.push(template);
      else grouped.set(meta.category, [template]);
    }
    return grouped;
  }, [catalog.data, query]);

  const filteredProjectTemplates = useMemo(
    () =>
      (projectTemplates.data ?? []).filter(
        (template) => !query || template.name.toLowerCase().includes(query),
      ),
    [projectTemplates.data, query],
  );
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const template of catalog.data ?? []) {
      const category = getCatalogMeta(template.name).category;
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return counts;
  }, [catalog.data]);

  const categoryNavigation: GalleryNavigationItem[] = CATALOG_CATEGORIES.filter(
    (category) => (categoryCounts.get(category.key) ?? 0) > 0,
  ).map((category) => ({
    key: category.key,
    label: category.label,
    icon: category.icon,
    count: categoryCounts.get(category.key),
  }));
  const customNavigation: GalleryNavigationItem[] =
    (projectTemplates.data?.length ?? 0) > 0
      ? [
          {
            key: CUSTOM_SECTION_KEY,
            label: "Your Examples",
            icon: User,
            count: projectTemplates.data?.length,
          },
        ]
      : [];
  const navigationItems = [...customNavigation, ...categoryNavigation];
  const sections: GallerySection[] = [
    ...(filteredProjectTemplates.length > 0
      ? [
          {
            key: CUSTOM_SECTION_KEY,
            label: "Your Examples",
            description:
              "Start from an evaluator this project already created.",
            templates: filteredProjectTemplates,
          },
        ]
      : []),
    ...CATALOG_CATEGORIES.flatMap((category) => {
      const templates = templatesByCategory.get(category.key) ?? [];
      return templates.length > 0
        ? [
            {
              key: category.key,
              label: category.label,
              description: category.description,
              templates,
            },
          ]
        : [];
    }),
  ];

  const setSectionRef = (key: string) => (element: HTMLElement | null) => {
    if (element) sectionRefs.current.set(key, element);
    else sectionRefs.current.delete(key);
  };
  const scrollToSection = (key: string) => {
    if (key === navigationItems[0]?.key) {
      scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    sectionRefs.current
      .get(key)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const containerTop = container.getBoundingClientRect().top;
    const atBottom =
      container.scrollTop + container.clientHeight >=
      container.scrollHeight - 4;
    let current = navigationItems[0]?.key ?? null;
    for (const item of navigationItems) {
      const element = sectionRefs.current.get(item.key);
      if (
        element &&
        (atBottom || element.getBoundingClientRect().top - containerTop <= 56)
      ) {
        current = item.key;
      }
    }
    setActiveSection(current);
  };
  const handleExpandedChange = (key: string, expanded: boolean) => {
    setExpandedSections((current) => {
      const next = new Set(current);
      if (expanded) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[80dvh] flex-col gap-0 p-0 sm:max-w-[66vw]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchInputRef.current?.focus();
        }}
      >
        <div
          className={cn(
            "dialog-header",
            "bg-background sticky top-0 z-30 flex shrink-0 flex-col gap-1.5 rounded-t-lg border-b p-4",
          )}
        >
          <div className="flex items-center gap-4">
            <DialogTitle className="min-w-0 flex-1">
              Configure evaluator
            </DialogTitle>
            <DialogClose className="ring-offset-background focus:ring-ring shrink-0 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>
          <DialogDescription>
            Choose a blank evaluator or start from an example.
          </DialogDescription>
        </div>
        <EvaluatorGalleryView
          search={search}
          onSearchChange={setSearch}
          searchInputRef={searchInputRef}
          navigationItems={navigationItems}
          activeSection={activeSection}
          onSelectSection={scrollToSection}
          sections={sections}
          expandedSections={expandedSections}
          onExpandedChange={handleExpandedChange}
          onSelectTemplate={onSelectTemplate}
          onCreateFromScratch={onCreateFromScratch}
          sectionRef={setSectionRef}
          scrollContainerRef={scrollContainerRef}
          onScroll={handleScroll}
          isLoading={catalog.isLoading}
          errorMessage={catalog.isError ? catalog.error.message : undefined}
        />
      </DialogContent>
    </Dialog>
  );
}
