import { type StudioQuery, type FilterState } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Input } from "@/src/components/design-system/Input/Input";

const identityColumns = new Set([
  "configId",
  "name",
  "scoreName",
  "source",
  "dataType",
]);
function valueOf(query: StudioQuery, column: string) {
  const filter = query.filters.find((item) => item.column === column);
  if (!filter) return "";
  if (typeof filter.value === "string") return filter.value;
  if (Array.isArray(filter.value)) return String(filter.value[0] ?? "");
  return "";
}
export function StudioScoreDefinitionPicker({
  query,
  projectId,
  onChange,
}: {
  query: StudioQuery;
  projectId: string;
  onChange: (query: StudioQuery) => void;
}) {
  const canRead = useHasProjectAccess({
    projectId,
    scope: "scoreConfigs:read",
  });
  const configs = api.scoreConfigs.all.useQuery(
    { projectId },
    { enabled: canRead, staleTime: 60000, meta: { silentHttpCodes: [403] } },
  );
  const selectedId = valueOf(query, "configId");
  const selected = configs.data?.configs.find((item) => item.id === selectedId);
  const scoreName = valueOf(query, "name") || valueOf(query, "scoreName");
  const source = valueOf(query, "source") || "all";
  const dataTypeByView: Record<string, string> = {
    "scores-boolean": "BOOLEAN",
    "scores-categorical": "CATEGORICAL",
  };
  const dataType = dataTypeByView[query.view] ?? "NUMERIC";
  const metricLabels: Record<string, string> = {
    NUMERIC: "Average score",
    BOOLEAN: "Pass rate (0–1)",
    CATEGORICAL: "Score records",
  };
  const populationDescriptions: Record<string, string> = {
    NUMERIC: "Average of individual numeric score values",
    BOOLEAN: "Pass rate: the average of boolean values, from 0 to 1",
    CATEGORICAL: "Count score records in each category",
  };
  const bind = (
    name: string,
    type: string,
    configId: string,
    origin: string,
  ) => {
    const filters: FilterState = query.filters.filter(
      (item) => !identityColumns.has(item.column),
    );
    if (configId)
      filters.push({
        type: "string",
        column: "configId",
        operator: "=",
        value: configId,
      });
    else if (name.trim())
      filters.push({
        type: "string",
        column: "name",
        operator: "=",
        value: name,
      });
    filters.push({
      type: "string",
      column: "dataType",
      operator: "=",
      value: type,
    });
    if (origin !== "all")
      filters.push({
        type: "string",
        column: "source",
        operator: "=",
        value: origin,
      });
    const viewByType: Record<string, StudioQuery["view"]> = {
      BOOLEAN: "scores-boolean",
      CATEGORICAL: "scores-categorical",
    };
    const view = viewByType[type] ?? "scores-numeric";
    onChange({
      ...query,
      view,
      label:
        name === (selected?.name || scoreName) && configId === selectedId
          ? query.label
          : name || query.label,
      filters,
      metrics:
        view === query.view
          ? query.metrics
          : [
              {
                id: "score",
                measure: type === "CATEGORICAL" ? "count" : "value",
                aggregation: type === "CATEGORICAL" ? "count" : "avg",
                label: metricLabels[type],
              },
            ],
      dimensions: view === query.view ? query.dimensions : [],
      orderBy: undefined,
    });
  };
  return (
    <div className="ph-no-capture flex flex-col gap-2 border-b pb-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium">
          Score definition
          <SelectInput
            noCapture
            aria-label={`Query ${query.id} score definition`}
            placeholder="Choose a definition"
            value={selectedId || "named"}
            options={[
              { value: "named", label: "Select by score name" },
              ...(selectedId && !selected
                ? [
                    {
                      value: selectedId,
                      label: scoreName || "Saved score definition",
                    },
                  ]
                : []),
              ...(configs.data?.configs ?? []).map((item) => ({
                value: item.id,
                label: `${item.name} · ${item.dataType.toLowerCase()}${item.dataType === "NUMERIC" ? ` · ${item.minValue ?? "…"}–${item.maxValue ?? "…"}` : ""}`,
              })),
            ]}
            onValueChange={(id) => {
              const definition = configs.data?.configs.find(
                (item) => item.id === id,
              );
              if (definition)
                bind(
                  definition.name,
                  definition.dataType,
                  definition.id,
                  source,
                );
              else bind(scoreName, dataType, "", source);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Origin
          <SelectInput
            aria-label={`Query ${query.id} score origin`}
            placeholder="All origins"
            value={source}
            options={[
              { value: "all", label: "All origins" },
              { value: "EVAL", label: "Automated (EVAL)" },
              { value: "API", label: "API" },
              { value: "ANNOTATION", label: "Human annotation" },
            ]}
            onValueChange={(origin) => {
              const filters = query.filters.filter(
                (filter) => filter.column !== "source",
              );
              if (origin !== "all")
                filters.push({
                  type: "string",
                  column: "source",
                  operator: "=",
                  value: origin,
                });
              onChange({ ...query, filters });
            }}
          />
        </label>
      </div>
      {!selectedId ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
          <Input
            aria-label={`Query ${query.id} score name`}
            placeholder="Enter the exact score name"
            value={scoreName}
            onChange={(e) => bind(e.target.value, dataType, "", source)}
          />
          <SelectInput
            aria-label={`Query ${query.id} score type`}
            placeholder="Type"
            value={dataType}
            options={[
              { value: "NUMERIC", label: "Numeric" },
              { value: "BOOLEAN", label: "Boolean" },
              { value: "CATEGORICAL", label: "Categorical" },
            ]}
            onValueChange={(type) => bind(scoreName, type, "", source)}
          />
        </div>
      ) : null}
      <p className="text-muted-foreground text-xs">
        {populationDescriptions[dataType]} · score timestamp ·{" "}
        {selected?.name || scoreName || "choose a definition"} ·{" "}
        {source === "all" ? "all origins" : source}. This measures score
        records, not distinct observations.
      </p>
    </div>
  );
}
