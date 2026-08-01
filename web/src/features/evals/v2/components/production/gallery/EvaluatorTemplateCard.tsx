import { formatDistanceToNowStrict } from "date-fns";
import { Badge } from "@/src/components/ui/badge";
import { LangfuseIcon } from "@/src/components/design-system/LangfuseIcon/LangfuseIcon";
import { getCatalogMeta } from "@/src/features/evals/v2/catalog-meta";
import type { EvaluatorTemplate, GalleryTemplate } from "./types";

function formatPartner(partner: string) {
  return partner.charAt(0).toUpperCase() + partner.slice(1);
}

export function EvaluatorTemplateCard({
  template,
  onSelect,
}: {
  template: GalleryTemplate;
  onSelect: (template: EvaluatorTemplate) => void;
}) {
  const meta = getCatalogMeta(template.name);
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
    ? ["by " + author, updated].filter(Boolean).join(" · ")
    : updated
      ? `Updated ${updated}`
      : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(template)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(template);
        }
      }}
      className="hover:border-primary hover:bg-accent/40 flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 pt-3.5 pb-2 text-left transition-all"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-sm font-bold" title={template.name}>
            {template.name}
          </span>
          <p
            className="text-muted-foreground line-clamp-1 text-sm leading-relaxed"
            title={description}
          >
            {description}
          </p>
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
