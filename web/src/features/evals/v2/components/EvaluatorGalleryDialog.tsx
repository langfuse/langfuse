import { useMemo, useRef, useState } from "react";
import { api, type RouterOutputs } from "@/src/utils/api";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  Code2,
  ChevronDown,
  ChevronUp,
  Search,
  Sparkles,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import {
  CATALOG_CATEGORIES,
  getCatalogMeta,
  getCategoryIconClasses,
} from "@/src/features/evals/v2/catalog-meta";
import { LangfuseIcon } from "@/src/components/design-system/LangfuseIcon/LangfuseIcon";
import { cn } from "@/src/utils/tailwind";

type EvalTemplate = RouterOutputs["evalsV2"]["catalog"][number];
// Project templates carry creator attribution on top of the catalog shape.
type GalleryTemplate = EvalTemplate & {
  createdByUser?: { name: string | null; email: string | null } | null;
};

// Two rows at the three-column grid before "Show all" takes over.
const MAX_TILES_PER_SECTION = 6;
const CUSTOM_SECTION_KEY = "custom";
// Experiment: cards without the per-category icon tile, with a "Use template"
// pill on hover instead. Flip to true to restore the icon tiles.
const SHOW_CARD_ICONS = false;

// Partner slugs ("ragas") render as author names ("by Ragas").
function formatPartner(partner: string) {
  return partner.charAt(0).toUpperCase() + partner.slice(1);
}

interface EvaluatorGalleryDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTemplate: (template: EvalTemplate) => void;
  onCreateFromScratch: (type: "llm" | "code") => void;
}

function EvaluatorCard({
  template,
  onSelect,
  icon: Icon,
  iconClassName,
}: {
  template: GalleryTemplate;
  onSelect: (template: EvalTemplate) => void;
  // Icon tile is uniform per section so groups read as one unit.
  icon: LucideIcon;
  iconClassName: string;
}) {
  const meta = getCatalogMeta(template.name);
  // Project-created templates have no catalog copy; fall back to their prompt,
  // or for code templates (which have none) to their language.
  const codeFallback =
    template.type === "CODE"
      ? `${
          template.sourceCodeLanguage === "PYTHON"
            ? "Python"
            : template.sourceCodeLanguage === "TYPESCRIPT"
              ? "TypeScript"
              : "Code"
        } evaluator${template.version > 1 ? ` · version ${template.version}` : ""}`
      : undefined;
  const description =
    meta.description ??
    (template.prompt?.trim() ? template.prompt : codeFallback);
  // Attribution line: partners read as authors (no date — the templates are
  // maintained, not edited); project templates credit their creator and show
  // when they last changed. With an author shown, the "Updated" prefix is
  // dropped so the line fits the card at the two-column width.
  // Maintained catalog templates (no project, no partner) are Langfuse's own.
  const isLangfuseMaintained = !template.partner && template.projectId === null;
  const author = template.partner
    ? formatPartner(template.partner)
    : isLangfuseMaintained
      ? "Langfuse"
      : (template.createdByUser?.name ?? template.createdByUser?.email ?? null);
  const updated = template.projectId
    ? formatDistanceToNowStrict(new Date(template.updatedAt), {
        addSuffix: true,
      })
    : null;
  const attribution = author
    ? [`by ${author}`, updated].filter(Boolean).join(" · ")
    : updated
      ? `Updated ${updated}`
      : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(template)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(template);
        }
      }}
      // pb-2 pairs with the footer's mt-2: description → author and
      // author → lower border share the same vertical space.
      className="hover:border-primary hover:bg-accent/40 flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 pt-3.5 pb-2 text-left transition-all hover:shadow-sm"
    >
      {SHOW_CARD_ICONS ? (
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            iconClassName,
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-sm font-bold" title={template.name}>
            {template.name}
          </span>
          {description ? (
            <p
              className="text-muted-foreground line-clamp-1 text-sm leading-relaxed"
              title={description}
            >
              {description}
            </p>
          ) : null}
        </div>
        <div className="mt-2 flex items-center gap-2">
          {attribution ? (
            <p className="text-muted-foreground/80 flex min-w-0 items-center gap-1.5 text-sm">
              {isLangfuseMaintained ? <LangfuseIcon size={14} /> : null}
              <span className="truncate" title={attribution}>
                {attribution}
              </span>
            </p>
          ) : null}
          <Badge
            variant="outline-solid"
            size="sm"
            className="text-muted-foreground ml-auto shrink-0 px-1.5 py-0.5 text-sm font-bold"
          >
            {template.type === "CODE" ? "Code" : "LLM-as-a-Judge"}
          </Badge>
        </div>
      </div>
    </div>
  );
}

// The gallery title is the parent heading; individual example groups sit one
// level below it visually and semantically.
function SectionHeader({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  return (
    <div>
      <h4 className="text-base leading-6 font-bold">{label}</h4>
      <p className="text-muted-foreground text-xs">{description}</p>
    </div>
  );
}

function GallerySkeleton() {
  return (
    <div className="flex flex-col gap-3 pt-2">
      <Skeleton className="h-5 w-32" />
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-25 rounded-lg" />
        ))}
      </div>
    </div>
  );
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
    const grouped = new Map<string, EvalTemplate[]>();
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
      if (existing) {
        existing.push(template);
      } else {
        grouped.set(meta.category, [template]);
      }
    }
    return grouped;
  }, [catalog.data, query]);

  const filteredProjectTemplates = useMemo(
    () =>
      (projectTemplates.data ?? []).filter(
        (t) => !query || t.name.toLowerCase().includes(query),
      ),
    [projectTemplates.data, query],
  );

  // Sidebar entries are stable across search input: only the catalog contents
  // decide which entries appear.
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const template of catalog.data ?? []) {
      const category = getCatalogMeta(template.name).category;
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return counts;
  }, [catalog.data]);

  type NavItem = {
    key: string;
    label: string;
    icon?: LucideIcon;
    count?: number;
  };

  const categoryNav: NavItem[] = CATALOG_CATEGORIES.filter(
    (c) => (categoryCounts.get(c.key) ?? 0) > 0,
  ).map((c) => ({
    key: c.key,
    label: c.label,
    icon: c.icon,
    count: categoryCounts.get(c.key),
  }));
  const customNav: NavItem[] =
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
  // Scroll-spy iterates in content order, so this must match the section
  // order in the scroll container.
  const navItems: NavItem[] = [...customNav, ...categoryNav];

  const visibleCategorySections = CATALOG_CATEGORIES.filter(
    (category) => (templatesByCategory.get(category.key)?.length ?? 0) > 0,
  );

  const setSectionRef = (key: string) => (el: HTMLElement | null) => {
    if (el) {
      sectionRefs.current.set(key, el);
    } else {
      sectionRefs.current.delete(key);
    }
  };

  const scrollToSection = (key: string) => {
    // The first section already sits at the top; scrollIntoView would align
    // it with the container edge and clip the top padding, nudging the view
    // down a little. Scroll home instead.
    if (key === navItems[0]?.key) {
      scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    sectionRefs.current
      .get(key)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const renderNavItem = (item: NavItem) => {
    const isActive = (activeSection ?? navItems[0]?.key) === item.key;
    return (
      <Button
        key={item.key}
        type="button"
        variant={isActive ? "secondary" : "ghost"}
        className={cn(
          "h-8 justify-start px-3 font-normal",
          // Same hover as the app sidebar's menu buttons (ui/sidebar.tsx).
          isActive
            ? "hover:bg-secondary"
            : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        )}
        onClick={() => scrollToSection(item.key)}
      >
        {item.icon ? <item.icon className="mr-2 h-4 w-4 shrink-0" /> : null}
        <span className="truncate" title={item.label}>
          {item.label}
        </span>
        {item.count !== undefined ? (
          <span className="text-muted-foreground ml-auto text-xs tabular-nums">
            {item.count}
          </span>
        ) : null}
      </Button>
    );
  };

  // Scroll-spy: the last section whose top passed the container top is active.
  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const containerTop = container.getBoundingClientRect().top;
    const atBottom =
      container.scrollTop + container.clientHeight >=
      container.scrollHeight - 4;
    let current = navItems[0]?.key ?? null;
    for (const item of navItems) {
      const el = sectionRefs.current.get(item.key);
      if (!el) continue;
      if (atBottom || el.getBoundingClientRect().top - containerTop <= 56) {
        current = item.key;
      }
    }
    setActiveSection(current);
  };

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const renderShowAllToggle = (key: string, total: number) => {
    if (total <= MAX_TILES_PER_SECTION) return null;
    const isExpanded = expandedSections.has(key);
    // The custom section lists the project's own evaluators, not catalog
    // examples.
    const noun = key === CUSTOM_SECTION_KEY ? "evaluators" : "examples";
    // Plain flush-left toggle (like the form's "Advanced") so the chevron
    // aligns with the cards' left edge instead of floating in ghost-button
    // padding.
    return (
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1.5 text-sm"
        onClick={() => toggleSection(key)}
      >
        {isExpanded ? (
          <>
            <ChevronUp className="h-3.5 w-3.5" />
            Show fewer
          </>
        ) : (
          <>
            <ChevronDown className="h-3.5 w-3.5" />
            Show all {total} {noun}
          </>
        )}
      </button>
    );
  };

  const renderTemplateGrid = (
    key: string,
    templates: GalleryTemplate[],
    icon: LucideIcon,
    iconClassName: string,
  ) => {
    const shown = expandedSections.has(key)
      ? templates
      : templates.slice(0, MAX_TILES_PER_SECTION);
    return (
      <>
        <div className="grid grid-cols-3 gap-3">
          {shown.map((template) => (
            <EvaluatorCard
              key={template.id}
              template={template}
              onSelect={onSelectTemplate}
              icon={icon}
              iconClassName={iconClassName}
            />
          ))}
        </div>
        {renderShowAllToggle(key, templates.length)}
      </>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[80dvh] flex-col gap-0 p-0 sm:max-w-[66vw]"
        // Radix would focus the first focusable element (the header close
        // button); typing to filter is the expected first action.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchInputRef.current?.focus();
        }}
      >
        {/* Bespoke header: DialogHeader centers its built-in close button
            against the full title+description block, but the title and close
            button must share one centered row. sticky+z-30+bg-background must
            match DialogHeader: they paint the header over DialogContent's
            always-rendered z-20 fallback close button (its .dialog-header
            :has() rule cannot match). */}
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
        <DialogBody className="flex-row gap-4 overflow-hidden p-0">
          <div className="flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r p-4">
            {/* Group header: one hierarchy level above the sm/font-normal
                nav items, so it must not render smaller than them. */}
            {navItems.length > 0 ? (
              <div className="flex h-8 shrink-0 items-center px-3 text-base font-bold">
                Examples
              </div>
            ) : null}
            {customNav.map(renderNavItem)}
            {categoryNav.map(renderNavItem)}
          </div>

          {/* Bottom padding lives inside the scroll container (pb-4 below,
              not on this column) so content scrolls to the dialog edge
              instead of clipping at an inset line. */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden p-4 pb-0 pl-0">
            <div className="shrink-0 border-b pb-4">
              <div className="relative">
                <Search className="text-muted-foreground absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2" />
                <Input
                  ref={searchInputRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search examples..."
                  className="pl-8"
                />
              </div>
            </div>

            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex flex-1 flex-col gap-8 overflow-y-auto py-4"
            >
              {catalog.isLoading ? (
                <GallerySkeleton />
              ) : catalog.isError ? (
                <div className="text-destructive py-8 text-center text-sm">
                  Error: {catalog.error.message}
                </div>
              ) : (
                <>
                  {!query ? (
                    <div className="flex flex-col gap-2.5">
                      <h3 className="text-xl leading-7 font-bold">
                        Start from scratch
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          className="hover:border-primary hover:bg-accent/40 flex items-center gap-3 rounded-lg border p-4 text-left transition-all hover:shadow-sm"
                          onClick={() => onCreateFromScratch("llm")}
                        >
                          <span
                            className={cn(
                              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                              getCategoryIconClasses("rag"),
                            )}
                          >
                            <Sparkles className="h-5 w-5" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-bold">
                              LLM-as-a-judge
                            </span>
                            <span className="text-muted-foreground block text-sm">
                              Start with a blank prompt.
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="hover:border-primary hover:bg-accent/40 flex items-center gap-3 rounded-lg border p-4 text-left transition-all hover:shadow-sm"
                          onClick={() => onCreateFromScratch("code")}
                        >
                          <span className="bg-light-blue/40 text-dark-blue flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                            <Code2 className="h-5 w-5" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-bold">
                              Code evaluator
                            </span>
                            <span className="text-muted-foreground block text-sm">
                              Start with Python or TypeScript.
                            </span>
                          </span>
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {filteredProjectTemplates.length > 0 ||
                  visibleCategorySections.length > 0 ? (
                    <h3 className="text-xl leading-7 font-bold">
                      Start from Examples
                    </h3>
                  ) : null}

                  {filteredProjectTemplates.length > 0 ? (
                    <section
                      ref={setSectionRef(CUSTOM_SECTION_KEY)}
                      className="flex scroll-mt-1 flex-col gap-2.5"
                    >
                      <SectionHeader
                        label="Your Examples"
                        description="Start from an evaluator this project already created."
                      />
                      {renderTemplateGrid(
                        CUSTOM_SECTION_KEY,
                        filteredProjectTemplates,
                        User,
                        "bg-muted text-muted-foreground",
                      )}
                    </section>
                  ) : null}

                  {visibleCategorySections.map((category) => (
                    <section
                      key={category.key}
                      ref={setSectionRef(category.key)}
                      className="flex scroll-mt-1 flex-col gap-2.5"
                    >
                      <SectionHeader
                        label={category.label}
                        description={category.description}
                      />
                      {renderTemplateGrid(
                        category.key,
                        templatesByCategory.get(category.key) ?? [],
                        category.icon,
                        getCategoryIconClasses(category.key),
                      )}
                    </section>
                  ))}

                  {visibleCategorySections.length === 0 &&
                  filteredProjectTemplates.length === 0 ? (
                    <div className="text-muted-foreground py-8 text-center text-sm">
                      No examples match your search.
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
