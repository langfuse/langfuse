import { useId, useState } from "react";
import { type FilterState } from "@langfuse/shared";
import { type ViewVersion } from "@langfuse/shared/query";
import { api } from "@/src/utils/api";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { MultiSelectTagInput } from "@/src/components/design-system/MultiSelectTagInput/MultiSelectTagInput";
import { useAllModels } from "@/src/features/dashboard/components/hooks";
import { buildHomeWidgetRecipe } from "./homeWidgetRecipes";
import { type HomePresetDraft } from "./dashboard-block-context";

export function HomePresetSelectionDialog({
  preset,
  projectId,
  version,
  filterState,
  dateRange,
  onContinue,
  actionLabel = "Open editor",
}: {
  preset: HomePresetDraft;
  projectId: string;
  version: ViewVersion;
  filterState: FilterState;
  dateRange: { from: Date; to: Date };
  actionLabel?: string;
  onContinue: (recipe: ReturnType<typeof buildHomeWidgetRecipe>) => void;
}) {
  const scores = preset.source.presetId === "home-score-analytics";
  const instance = useId();
  const models = useAllModels(
    projectId,
    filterState,
    dateRange.from,
    dateRange.to,
    version,
    { enabled: !scores, queryId: instance },
  );
  const columns = api.scores.getScoreColumns.useQuery(
    { projectId, fromTimestamp: dateRange.from, toTimestamp: dateRange.to },
    { enabled: scores },
  );
  const definitions = (columns.data?.scoreColumns ?? []).filter((entry) =>
    ["NUMERIC", "BOOLEAN", "CATEGORICAL"].includes(entry.dataType),
  );
  const scoreId = (entry: { name: string; source: string; dataType: string }) =>
    JSON.stringify([entry.name, entry.source, entry.dataType]);
  const [selection, setSelection] = useState(() =>
    scores
      ? (preset.selection.scores ?? []).map(scoreId)
      : (preset.selection.models ?? []),
  );
  const options = scores
    ? definitions.map((entry) => ({
        value: scoreId(entry),
        label: [
          entry.name,
          entry.source.toLowerCase(),
          entry.dataType.toLowerCase(),
        ].join(" · "),
      }))
    : models.data.map(({ model }) => ({
        value: model,
        label: model || "Unnamed model",
      }));
  const recipe = buildHomeWidgetRecipe(preset.source.presetId, {
    ...preset.selection,
    version,
    ...(scores
      ? {
          scores: definitions.filter((entry) =>
            selection.includes(scoreId(entry)),
          ),
        }
      : { models: selection }),
  });
  const loading = scores ? columns.isPending : models.isPending;
  const noun = scores ? "scores" : "models";
  return (
    <Dialog
      title={
        scores
          ? "Choose scores for this widget"
          : "Choose models for this widget"
      }
      closeLabel="Cancel"
      noCapture
      actions={[
        {
          label: actionLabel,
          disabled: !("config" in recipe),
          onClick: () => {
            if ("config" in recipe) onContinue(recipe);
          },
        },
      ]}
    >
      <Dialog.Body>
        <p className="text-muted-foreground mb-3 text-sm">
          {scores
            ? "Choose up to four score definitions. Each gets a distribution tab and a trend tab."
            : "The widget will use these models as its starting filters."}
        </p>
        {loading && <p role="status">Loading {noun}…</p>}
        {!loading && scores && columns.isError && (
          <p role="alert">Could not load scores for this date range.</p>
        )}
        {!loading && !(scores && columns.isError) && (
          <MultiSelectTagInput
            aria-label={scores ? "Score definitions" : "Models"}
            value={selection}
            onValueChange={setSelection}
            options={options}
            placeholder={`Choose ${noun}`}
            searchPlaceholder={`Search ${noun}`}
            emptyMessage={`No matching ${noun} in this date range.`}
          />
        )}
      </Dialog.Body>
    </Dialog>
  );
}
