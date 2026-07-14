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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Input } from "@/src/components/ui/input";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  ChevronDown,
  ChevronUp,
  Code2,
  Copy,
  Plus,
  Search,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import {
  CATALOG_CATEGORIES,
  getCatalogMeta,
  getCategoryIconClasses,
} from "@/src/features/evals/v2/catalog-meta";
import { cn } from "@/src/utils/tailwind";

type EvalTemplate = RouterOutputs["evalsV2"]["catalog"][number];
// Project templates carry creator attribution on top of the catalog shape.
type GalleryTemplate = EvalTemplate & {
  createdByUser?: { name: string | null; email: string | null } | null;
};

const MAX_TILES_PER_SECTION = 6;
const CLONE_SECTION_KEY = "clone";

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
  const author = template.partner
    ? formatPartner(template.partner)
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
      className="hover:border-primary/30 hover:bg-accent/40 flex h-22 cursor-pointer items-center gap-3 rounded-lg border p-3.5 text-left transition-all hover:shadow-sm"
    >
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          iconClassName,
        )}
      >
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium" title={template.name}>
            {template.name}
          </span>
          <Badge
            variant="outline-solid"
            size="sm"
            className="text-muted-foreground ml-auto shrink-0 px-1.5 py-0.5 text-[10px] font-medium"
          >
            {template.type === "CODE" ? "Code" : "LLM-as-a-Judge"}
          </Badge>
        </div>
        {attribution ? (
          <p
            className="text-muted-foreground/80 truncate text-[11px]"
            title={attribution}
          >
            {attribution}
          </p>
        ) : null}
        {description ? (
          <p
            className="text-muted-foreground line-clamp-1 text-xs leading-relaxed"
            title={description}
          >
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function SectionHeader({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{label}</h3>
      <p className="text-muted-foreground text-xs">{description}</p>
    </div>
  );
}

function GallerySkeleton() {
  return (
    <div className="flex flex-col gap-3 pt-2">
      <Skeleton className="h-5 w-32" />
      <div className="grid grid-cols-2 gap-3 2xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
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
  const existingNav: NavItem[] =
    (projectTemplates.data?.length ?? 0) > 0
      ? [
          {
            key: CLONE_SECTION_KEY,
            label: "Start from existing",
            icon: Copy,
            count: projectTemplates.data?.length,
          },
        ]
      : [];
  // Scroll-spy iterates in content order, so this must match the section
  // order in the scroll container.
  const navItems: NavItem[] = [...existingNav, ...categoryNav];

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
    sectionRefs.current
      .get(key)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const renderNavItem = (item: NavItem) => {
    // The clone entry never gets the active background — it sits at the top
    // and would read as permanently highlighted.
    const isActive =
      item.key !== CLONE_SECTION_KEY &&
      (activeSection ?? navItems[0]?.key) === item.key;
    return (
      <Button
        key={item.key}
        type="button"
        variant={isActive ? "secondary" : "ghost"}
        className={cn(
          "h-8 justify-start px-3 font-normal",
          // Nav items only signal state via the active background, not hover.
          isActive ? "hover:bg-secondary" : "hover:bg-transparent",
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
    // The clone section lists the project's own evaluators, not templates.
    const noun = key === CLONE_SECTION_KEY ? "evaluators" : "templates";
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground self-start"
        onClick={() => toggleSection(key)}
      >
        {isExpanded ? (
          <>
            <ChevronUp className="mr-1.5 h-3.5 w-3.5" />
            Show fewer
          </>
        ) : (
          <>
            <ChevronDown className="mr-1.5 h-3.5 w-3.5" />
            Show all {total} {noun}
          </>
        )}
      </Button>
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
        <div className="grid grid-cols-2 gap-3 2xl:grid-cols-3">
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
      <DialogContent className="flex h-[80dvh] flex-col gap-0 p-0 sm:max-w-[66vw]">
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
            Pick a maintained evaluator or start from scratch.
          </DialogDescription>
        </div>
        <DialogBody className="flex-row gap-4 overflow-hidden p-0">
          <div className="flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r p-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="secondary"
                  className="mb-2 w-full"
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Create from scratch
                  <ChevronDown className="ml-1.5 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72">
                <DropdownMenuItem
                  className="items-start gap-3"
                  onClick={() => onCreateFromScratch("llm")}
                >
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-medium">LLM-as-a-Judge</span>
                    <span className="text-muted-foreground text-xs">
                      Write a prompt from scratch to evaluate your data.
                    </span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="items-start gap-3"
                  onClick={() => onCreateFromScratch("code")}
                >
                  <Code2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-medium">Code</span>
                    <span className="text-muted-foreground text-xs">
                      Score data with Python or TypeScript.
                    </span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {existingNav.map(renderNavItem)}
            {existingNav.length > 0 && categoryNav.length > 0 ? (
              <div className="bg-border my-1.5 h-px shrink-0" />
            ) : null}
            {categoryNav.length > 0 ? (
              <div className="flex h-8 shrink-0 items-center px-3 text-sm font-semibold">
                Templates
              </div>
            ) : null}
            {categoryNav.map(renderNavItem)}
          </div>

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden p-4 pl-0">
            <div className="shrink-0 border-b pb-4">
              <div className="relative">
                <Search className="text-muted-foreground absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search evaluators..."
                  className="pl-8"
                />
              </div>
            </div>

            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex flex-1 flex-col gap-4 overflow-y-auto pt-4"
            >
              {catalog.isLoading ? (
                <GallerySkeleton />
              ) : catalog.isError ? (
                <div className="text-destructive py-8 text-center text-sm">
                  Error: {catalog.error.message}
                </div>
              ) : (
                <>
                  {filteredProjectTemplates.length > 0 ? (
                    <section
                      ref={setSectionRef(CLONE_SECTION_KEY)}
                      className="flex scroll-mt-1 flex-col gap-2.5 pt-2"
                    >
                      <SectionHeader
                        label="Start from existing"
                        description="Start from an evaluator this project already created."
                      />
                      {renderTemplateGrid(
                        CLONE_SECTION_KEY,
                        filteredProjectTemplates,
                        Copy,
                        "bg-muted text-muted-foreground",
                      )}
                    </section>
                  ) : null}

                  {/* Labeled divider separating the project's own evaluators
                      from the maintained catalog below. */}
                  {filteredProjectTemplates.length > 0 &&
                  visibleCategorySections.length > 0 ? (
                    <div className="flex items-center gap-3 pt-2">
                      <h3 className="text-base font-semibold">Templates</h3>
                      <div className="bg-border h-px flex-1" />
                    </div>
                  ) : null}

                  {visibleCategorySections.map((category) => (
                    <section
                      key={category.key}
                      ref={setSectionRef(category.key)}
                      className="flex scroll-mt-1 flex-col gap-2.5 pt-2"
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
                      No evaluators match your search.
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
