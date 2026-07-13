import { useMemo, useRef, useState } from "react";
import { api, type RouterOutputs } from "@/src/utils/api";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
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
  type LucideIcon,
} from "lucide-react";
import {
  CATALOG_CATEGORIES,
  getCatalogMeta,
  getCategoryIconClasses,
} from "@/src/features/evals/v2/catalog-meta";
import { cn } from "@/src/utils/tailwind";

type EvalTemplate = RouterOutputs["evalsV2"]["catalog"][number];

const MAX_TILES_PER_SECTION = 6;
const SCRATCH_SECTION_KEY = "scratch";
const CLONE_SECTION_KEY = "clone";

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
}: {
  template: EvalTemplate;
  onSelect: (template: EvalTemplate) => void;
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
      className="hover:border-primary/30 hover:bg-accent/40 flex min-h-[5.5rem] cursor-pointer items-center gap-3 rounded-lg border p-3.5 text-left transition-all hover:shadow-sm"
    >
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          getCategoryIconClasses(meta.category),
        )}
      >
        <meta.icon className="h-[18px] w-[18px]" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium" title={template.name}>
            {template.name}
          </span>
          {/* The LLM-as-a-judge type is the catalog default, so only
              deviations (code templates, partner attribution) earn a label. */}
          {template.type === "CODE" || template.partner ? (
            <span className="text-muted-foreground ml-auto shrink-0 text-[10px] font-medium tracking-wide uppercase">
              {[template.type === "CODE" ? "Code" : null, template.partner]
                .filter(Boolean)
                .join(" · ")}
            </span>
          ) : null}
        </div>
        {description ? (
          <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  label,
  description,
}: {
  icon: LucideIcon;
  label: string;
  description: string;
}) {
  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <Icon className="h-4 w-4 shrink-0" />
        {label}
      </h3>
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
  const [activeSection, setActiveSection] = useState(SCRATCH_SECTION_KEY);
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

  const primaryNav: NavItem[] = [
    { key: SCRATCH_SECTION_KEY, label: "Create from scratch" },
    ...((projectTemplates.data?.length ?? 0) > 0
      ? [
          {
            key: CLONE_SECTION_KEY,
            label: "Clone from existing",
            count: projectTemplates.data?.length,
          },
        ]
      : []),
  ];
  const categoryNav: NavItem[] = CATALOG_CATEGORIES.filter(
    (c) => (categoryCounts.get(c.key) ?? 0) > 0,
  ).map((c) => ({
    key: c.key,
    label: c.label,
    icon: c.icon,
    count: categoryCounts.get(c.key),
  }));
  // Scroll-spy iterates in content order, so this must match the section
  // order in the scroll container.
  const navItems: NavItem[] = [...primaryNav, ...categoryNav];

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

  const renderNavItem = (item: NavItem) => (
    <Button
      key={item.key}
      type="button"
      variant={activeSection === item.key ? "secondary" : "ghost"}
      className="h-9 justify-start px-3"
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

  // Scroll-spy: the last section whose top passed the container top is active.
  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const containerTop = container.getBoundingClientRect().top;
    const atBottom =
      container.scrollTop + container.clientHeight >=
      container.scrollHeight - 4;
    let current = navItems[0]?.key ?? SCRATCH_SECTION_KEY;
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
            Show all {total} templates
          </>
        )}
      </Button>
    );
  };

  const renderTemplateGrid = (key: string, templates: EvalTemplate[]) => {
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
        <DialogHeader>
          <DialogTitle>Configure evaluator</DialogTitle>
          <DialogDescription>
            Pick a maintained evaluator or start from scratch.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex-row gap-4 overflow-hidden p-0">
          <div className="flex w-56 shrink-0 flex-col gap-1.5 overflow-y-auto border-r p-4">
            {primaryNav.map(renderNavItem)}
            <div className="bg-border my-1 h-px shrink-0" />
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
              <section
                ref={setSectionRef(SCRATCH_SECTION_KEY)}
                className="flex scroll-mt-1 flex-col gap-2.5"
              >
                <SectionHeader
                  icon={Plus}
                  label="Create from scratch"
                  description="Write your own evaluator as an LLM-as-a-judge prompt or code."
                />
                <div className="grid grid-cols-2 gap-3 2xl:grid-cols-3">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onCreateFromScratch("llm")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onCreateFromScratch("llm");
                      }
                    }}
                    className="hover:border-primary/30 hover:bg-accent/40 flex min-h-[5.5rem] cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3.5 text-left transition-all hover:shadow-sm"
                  >
                    <div className="bg-muted text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                      <Sparkles className="h-[18px] w-[18px]" />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span
                        className="truncate text-sm font-medium"
                        title="LLM-as-a-Judge"
                      >
                        LLM-as-a-Judge
                      </span>
                      <p className="text-muted-foreground text-xs leading-relaxed">
                        Write a prompt from scratch to evaluate your data.
                      </p>
                    </div>
                  </div>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onCreateFromScratch("code")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onCreateFromScratch("code");
                      }
                    }}
                    className="hover:border-primary/30 hover:bg-accent/40 flex min-h-[5.5rem] cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3.5 text-left transition-all hover:shadow-sm"
                  >
                    <div className="bg-muted text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                      <Code2 className="h-[18px] w-[18px]" />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span
                        className="truncate text-sm font-medium"
                        title="Code"
                      >
                        Code
                      </span>
                      <p className="text-muted-foreground text-xs leading-relaxed">
                        Score data with Python or TypeScript.
                      </p>
                    </div>
                  </div>
                </div>
              </section>

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
                        icon={Copy}
                        label="Clone from existing"
                        description="Start from an evaluator this project already created."
                      />
                      {renderTemplateGrid(
                        CLONE_SECTION_KEY,
                        filteredProjectTemplates,
                      )}
                    </section>
                  ) : null}

                  {visibleCategorySections.map((category) => (
                    <section
                      key={category.key}
                      ref={setSectionRef(category.key)}
                      className="flex scroll-mt-1 flex-col gap-2.5 pt-2"
                    >
                      <SectionHeader
                        icon={category.icon}
                        label={category.label}
                        description={category.description}
                      />
                      {renderTemplateGrid(
                        category.key,
                        templatesByCategory.get(category.key) ?? [],
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
