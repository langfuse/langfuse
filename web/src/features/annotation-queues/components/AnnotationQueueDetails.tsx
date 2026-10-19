import { type ReactNode, useState } from "react";
import { SearchInput } from "@/src/components/design-system/SearchInput/SearchInput";
import { getScoreDataTypeIcon } from "@/src/features/scores";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { type ScoreConfigDomain } from "@langfuse/shared";

type ScoreField = Pick<
  ScoreConfigDomain,
  | "id"
  | "name"
  | "description"
  | "dataType"
  | "minValue"
  | "maxValue"
  | "categories"
  | "isArchived"
>;

function describeScoreField(config: ScoreField): string {
  switch (config.dataType) {
    case "NUMERIC":
      if (config.minValue != null && config.maxValue != null) {
        return `Numeric · ${config.minValue} to ${config.maxValue}`;
      }
      if (config.minValue != null) return `Numeric · ≥ ${config.minValue}`;
      if (config.maxValue != null) return `Numeric · ≤ ${config.maxValue}`;
      return "Numeric";
    case "CATEGORICAL": {
      const count = config.categories?.length ?? 0;
      return `Categorical · ${count} option${count === 1 ? "" : "s"}`;
    }
    case "BOOLEAN":
      return "Boolean · True / False";
    case "TEXT":
      return "Text";
  }
}

export function AnnotationQueueDetails({
  description,
  scoreConfigs,
  editAction,
}: {
  description: string | null;
  scoreConfigs: ScoreField[];
  editAction: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const visibleConfigs = scoreConfigs.filter((config) =>
    config.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {description && (
        <section className="shrink-0 border-b p-4">
          <h3 className="text-xs font-bold">Description</h3>
          <p
            className="text-muted-foreground mt-2 line-clamp-4 text-xs leading-relaxed wrap-anywhere whitespace-pre-wrap"
            title={description}
          >
            {description}
          </p>
        </section>
      )}
      <section
        className="flex min-h-0 flex-1 flex-col"
        aria-label="Queue score configs"
      >
        <div className="flex shrink-0 flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="text-xs font-bold">Score configs</h3>
              <Badge text={String(scoreConfigs.length)} color="ghost" />
            </div>
          </div>
          {editAction}
          {scoreConfigs.length > 8 && (
            <SearchInput
              value={search}
              onChange={setSearch}
              onSubmit={setSearch}
              placeholder="Find a score config..."
            />
          )}
        </div>
        <ul
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-4"
          aria-label="Queue score config order"
        >
          {visibleConfigs.map((config) => (
            <li
              key={config.id}
              className="flex items-center gap-2 py-1.5"
              title={[
                config.name,
                describeScoreField(config),
                config.description,
              ]
                .filter(Boolean)
                .join(" · ")}
            >
              <span
                className="text-muted-foreground w-4 shrink-0 text-center text-xs"
                aria-hidden
              >
                {getScoreDataTypeIcon(config.dataType)}
              </span>
              <span
                className="min-w-0 flex-1 truncate text-xs"
                title={config.name}
              >
                {config.name}
              </span>
              {config.isArchived && <Badge text="Archived" size="sm" />}
            </li>
          ))}
          {search && visibleConfigs.length === 0 && (
            <li className="text-muted-foreground py-2 text-xs">
              No matching score configs.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
