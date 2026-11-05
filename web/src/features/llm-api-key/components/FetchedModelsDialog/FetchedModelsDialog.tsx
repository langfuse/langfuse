import { useState } from "react";

import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { SearchInput } from "@/src/components/design-system/SearchInput/SearchInput";

type ModelRow = {
  model: string;
  status: "configured" | "new" | "missing";
};

/**
 * Configured models keep their order (the connection test uses the first one),
 * followed by the endpoint's other models. Configured models the endpoint no
 * longer returns stay in the list so they are only removed on purpose.
 */
function toModelRows(params: {
  configuredModels: string[];
  fetchedModels: string[];
}): ModelRow[] {
  const fetched = new Set(params.fetchedModels);
  const configured = new Set(params.configuredModels);

  return [
    ...params.configuredModels.map((model) => ({
      model,
      status: fetched.has(model)
        ? ("configured" as const)
        : ("missing" as const),
    })),
    ...params.fetchedModels
      .filter((model) => !configured.has(model))
      .map((model) => ({ model, status: "new" as const })),
  ];
}

type FetchedModelsDialogProps = {
  configuredModels: string[];
  fetchedModels: string[];
  onApply: (models: string[]) => void;
};

export function FetchedModelsDialog({
  configuredModels,
  fetchedModels,
  onApply,
}: FetchedModelsDialogProps) {
  const rows = toModelRows({ configuredModels, fetchedModels });
  const [selected, setSelected] = useState(
    () => new Set(rows.map((row) => row.model)),
  );
  const [query, setQuery] = useState("");

  const visibleRows = rows.filter((row) =>
    row.model.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const toggle = (model: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });

  // Acts on the filtered rows only, so a filter narrows what gets (de)selected.
  const areAllVisibleSelected =
    visibleRows.length > 0 &&
    visibleRows.every((row) => selected.has(row.model));
  const toggleAllVisible = () =>
    setSelected((current) => {
      const next = new Set(current);
      for (const row of visibleRows) {
        if (areAllVisibleSelected) next.delete(row.model);
        else next.add(row.model);
      }
      return next;
    });

  return (
    <Dialog
      title="Models served by the endpoint"
      size="md"
      actions={[
        {
          label: `Use ${selected.size} model${selected.size === 1 ? "" : "s"}`,
          onClick: () =>
            onApply(
              rows.map((row) => row.model).filter((m) => selected.has(m)),
            ),
        },
      ]}
    >
      <Dialog.Body>
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">
            {fetchedModels.length} model{fetchedModels.length === 1 ? "" : "s"}{" "}
            found. The selection will replace the custom models.
          </p>
          <SearchInput
            value={query}
            onChange={setQuery}
            onSubmit={setQuery}
            placeholder="Search models"
          />
          <label
            htmlFor="fetched-models-select-all"
            className="flex items-center gap-2 border-b pb-2 text-sm"
          >
            <Checkbox
              id="fetched-models-select-all"
              checked={areAllVisibleSelected}
              disabled={visibleRows.length === 0}
              onCheckedChange={toggleAllVisible}
            />
            {query.trim() ? "Select all shown" : "Select all"}
          </label>
          {/* Model ids come from the customer's endpoint: keep them out of session replay. */}
          <div className="ph-no-capture flex max-h-80 flex-col gap-1 overflow-y-auto">
            {visibleRows.map((row) => {
              const id = `fetched-model-${row.model}`;
              return (
                <label
                  key={row.model}
                  htmlFor={id}
                  className="flex items-center gap-2 py-1 text-sm"
                >
                  <Checkbox
                    id={id}
                    checked={selected.has(row.model)}
                    onCheckedChange={() => toggle(row.model)}
                  />
                  <span className="min-w-0 flex-1 truncate" title={row.model}>
                    {row.model}
                  </span>
                  {row.status === "new" && (
                    <Badge size="sm" color="green" text="New" />
                  )}
                  {row.status === "missing" && (
                    <Badge
                      size="sm"
                      color="yellow"
                      text="Not returned by the endpoint"
                    />
                  )}
                </label>
              );
            })}
          </div>
        </div>
      </Dialog.Body>
    </Dialog>
  );
}
