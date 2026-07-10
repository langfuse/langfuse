import { useMemo, useState } from "react";
import { api, type RouterOutputs } from "@/src/utils/api";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Code2, PenLine, Search } from "lucide-react";
import {
  CATALOG_CATEGORIES,
  getCatalogMeta,
} from "@/src/features/evals/v2/catalog-meta";

type EvalTemplate = RouterOutputs["evalsV2"]["catalog"][number];

interface EvaluatorGalleryDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTemplate: (template: EvalTemplate) => void;
  onCreateFromScratch: (type: "llm" | "code") => void;
}

const formatPartner = (partner: string) =>
  partner.charAt(0).toUpperCase() + partner.slice(1);

function EvaluatorCard({
  template,
  onSelect,
}: {
  template: EvalTemplate;
  onSelect: (template: EvalTemplate) => void;
}) {
  const meta = getCatalogMeta(template.name);
  const Icon = meta.icon;

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
      className="hover:bg-accent/50 flex cursor-pointer flex-col gap-2 rounded-md border p-3 text-left transition-colors"
    >
      <div className="flex items-center gap-2">
        <div className="bg-muted flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
          <Icon className="h-4 w-4" />
        </div>
        <span className="truncate text-sm font-medium" title={template.name}>
          {template.name}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Badge
            variant="outline"
            size="sm"
            className="border-border font-normal"
          >
            {template.type === "CODE" ? "Code" : "LLM-as-a-judge"}
          </Badge>
          {template.partner ? (
            <Badge variant="secondary" size="sm" className="font-normal">
              {formatPartner(template.partner)}
            </Badge>
          ) : null}
        </div>
      </div>
      {meta.description ? (
        <p className="text-muted-foreground line-clamp-2 text-xs">
          {meta.description}
        </p>
      ) : null}
    </div>
  );
}

function GallerySkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-5 w-32" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-md" />
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
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const catalog = api.evalsV2.catalog.useQuery(
    { projectId },
    { enabled: open },
  );

  const templatesByCategory = useMemo(() => {
    const grouped = new Map<string, EvalTemplate[]>();
    const query = search.trim().toLowerCase();
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
  }, [catalog.data, search]);

  // Sidebar entries are stable across search input: only the category filter
  // and the catalog contents decide which categories appear.
  const sidebarCategories = useMemo(() => {
    const present = new Set(
      (catalog.data ?? []).map((t) => getCatalogMeta(t.name).category),
    );
    return CATALOG_CATEGORIES.filter((c) => present.has(c.key));
  }, [catalog.data]);

  const visibleSections = CATALOG_CATEGORIES.filter(
    (category) =>
      (activeCategory === "all" || activeCategory === category.key) &&
      (templatesByCategory.get(category.key)?.length ?? 0) > 0,
  );

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
          <div className="flex w-40 shrink-0 flex-col gap-1 overflow-y-auto border-r p-3">
            <Button
              type="button"
              variant={activeCategory === "all" ? "secondary" : "ghost"}
              size="sm"
              className="justify-start"
              onClick={() => setActiveCategory("all")}
            >
              All
            </Button>
            {sidebarCategories.map((category) => (
              <Button
                key={category.key}
                type="button"
                variant={
                  activeCategory === category.key ? "secondary" : "ghost"
                }
                size="sm"
                className="justify-start"
                onClick={() => setActiveCategory(category.key)}
              >
                {category.label}
              </Button>
            ))}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4 pl-0">
            <div className="relative shrink-0">
              <Search className="text-muted-foreground absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search evaluators..."
                className="pl-8"
              />
            </div>

            <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-3">
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
                className="hover:bg-accent/50 flex cursor-pointer flex-col gap-2 rounded-md border border-dashed p-3 text-left transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="bg-muted flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
                    <PenLine className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium">
                    LLM-as-a-Judge Evaluator
                  </span>
                </div>
                <p className="text-muted-foreground text-xs">
                  Write a prompt from scratch to evaluate your data.
                </p>
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
                className="hover:bg-accent/50 flex cursor-pointer flex-col gap-2 rounded-md border border-dashed p-3 text-left transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="bg-muted flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
                    <Code2 className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium">Code Evaluator</span>
                </div>
                <p className="text-muted-foreground text-xs">
                  Score data with Python or TypeScript.
                </p>
              </div>
            </div>

            {catalog.isLoading ? (
              <GallerySkeleton />
            ) : catalog.isError ? (
              <div className="text-destructive py-8 text-center text-sm">
                Error: {catalog.error.message}
              </div>
            ) : visibleSections.length === 0 ? (
              <div className="text-muted-foreground py-8 text-center text-sm">
                No evaluators match your search.
              </div>
            ) : (
              visibleSections.map((category) => (
                <section
                  key={category.key}
                  className="flex flex-col gap-3 pt-6"
                >
                  <div>
                    <h3 className="text-sm font-semibold">{category.label}</h3>
                    <p className="text-muted-foreground text-xs">
                      {category.description}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
                    {(templatesByCategory.get(category.key) ?? []).map(
                      (template) => (
                        <EvaluatorCard
                          key={template.id}
                          template={template}
                          onSelect={onSelectTemplate}
                        />
                      ),
                    )}
                  </div>
                </section>
              ))
            )}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
