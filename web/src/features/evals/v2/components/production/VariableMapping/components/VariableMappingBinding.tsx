import { ChevronRight } from "lucide-react";

import {
  crumbLabel,
  jsonPathToSegments,
} from "@/src/features/evals/v2/lib/jsonPathSegments";
import { cn } from "@/src/utils/tailwind";

/** Mapping path rendered in the header of editable and read-only cards. */
export function VariableMappingBinding({
  columnLabel,
  jsonSelector,
}: {
  columnLabel: string;
  jsonSelector: string | null;
}) {
  const segments = jsonSelector ? jsonPathToSegments(jsonSelector) : [];

  if (segments === null) {
    return (
      <span
        className="min-w-0 truncate font-mono text-sm"
        title={`${columnLabel}: ${jsonSelector ?? ""} — custom path`}
      >
        {columnLabel}: {jsonSelector}
      </span>
    );
  }

  const labels = segments.map(crumbLabel);
  const fullPath = [columnLabel].concat(labels).join(" > ");
  const renderPath = (pathLabels: string[]) => (
    <>
      <span className="shrink-0 font-bold">{columnLabel}</span>
      {pathLabels.map((label, index) => (
        <span
          key={index}
          className={cn(
            "flex min-w-0 items-baseline gap-1 overflow-hidden",
            index === pathLabels.length - 1 && "shrink-0",
          )}
        >
          <ChevronRight className="text-muted-foreground h-3 w-3 shrink-0 self-center" />
          <span
            className="max-w-40 truncate font-mono text-sm"
            title={label === "..." ? fullPath : label}
          >
            {label}
          </span>
        </span>
      ))}
    </>
  );

  if (labels.length <= 2) {
    return (
      <span
        className="flex min-w-0 items-baseline gap-1 overflow-hidden whitespace-nowrap"
        title={fullPath}
      >
        {renderPath(labels)}
      </span>
    );
  }

  return (
    <span
      className="block min-w-0 overflow-hidden whitespace-nowrap"
      title={fullPath}
      data-variable-mapping-binding=""
    >
      <span
        className="flex min-w-0 items-baseline gap-1 @xs:hidden"
        data-path-variant="truncated"
        aria-hidden="true"
        title={fullPath}
      >
        <span className="min-w-0 overflow-hidden whitespace-nowrap">
          {columnLabel}
        </span>
        <ChevronRight className="text-muted-foreground h-3 w-3 shrink-0 self-center" />
        <span className="shrink-0">...</span>
      </span>
      <span
        className="hidden min-w-0 items-baseline gap-1 overflow-hidden @xs:flex @md:hidden"
        data-path-variant="compact"
        aria-hidden="true"
      >
        {renderPath(["...", labels.at(-1)!])}
      </span>
      <span
        className="hidden min-w-0 items-baseline gap-1 overflow-hidden @md:flex"
        data-path-variant="full"
        aria-hidden="true"
      >
        {renderPath(labels)}
      </span>
      <span className="sr-only">{fullPath}</span>
    </span>
  );
}
