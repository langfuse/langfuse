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
}: {
  description: string | null;
  scoreConfigs: ScoreField[];
}) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-6 p-4">
      {description && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-bold">Description</h3>
          <p className="text-muted-foreground text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap">
            {description}
          </p>
        </section>
      )}
      <section className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold">Score fields</h3>
          <Badge text={String(scoreConfigs.length)} size="sm" />
        </div>
        {scoreConfigs.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No score fields configured.
          </p>
        ) : (
          <ul className="divide-y" aria-label="Score fields">
            {[...scoreConfigs]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((config) => (
                <li key={config.id} className="flex flex-col gap-1 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 text-sm font-bold wrap-anywhere">
                      {config.name}
                    </span>
                    {config.isArchived && <Badge text="Archived" size="sm" />}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {describeScoreField(config)}
                  </p>
                  {config.description && (
                    <p className="text-muted-foreground text-xs leading-relaxed wrap-anywhere whitespace-pre-wrap">
                      {config.description}
                    </p>
                  )}
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}
