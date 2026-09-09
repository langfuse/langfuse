/**
 * Prototype "Attributes" tab for ObservationDetailView.
 *
 * Shows the observation's fixed-key attributes (model, environment, release,
 * version, model parameters) as a light two-column key/value list, followed
 * by the free-form metadata rendered with the same PrettyJsonView the
 * Preview tab uses. Nothing here is removed from the header yet — this tab
 * exists to evaluate the placement.
 */

import { type JsonNested } from "@langfuse/shared";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { type MediaReturnType } from "@/src/features/media/validation";

type AttributeRow = { key: string; value: string };

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function modelParameterRows(
  modelParameters: JsonNested | null | undefined,
): AttributeRow[] {
  if (
    !modelParameters ||
    typeof modelParameters !== "object" ||
    Array.isArray(modelParameters)
  ) {
    return [];
  }
  return Object.entries(modelParameters)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => ({ key, value: stringifyValue(value) }));
}

export function ObservationAttributesTab({
  model,
  environment,
  release,
  version,
  modelParameters,
  parsedMetadata,
  isLoading,
  isParsing,
  media,
}: {
  model: string | null;
  environment: string | null;
  release: string | null | undefined;
  version: string | null;
  modelParameters: JsonNested | null | undefined;
  parsedMetadata: unknown;
  isLoading?: boolean;
  isParsing?: boolean;
  media?: MediaReturnType[];
}) {
  const rows: AttributeRow[] = [
    { key: "model", value: model ?? "" },
    { key: "environment", value: environment ?? "" },
    { key: "release", value: release ?? "" },
    { key: "version", value: version ?? "" },
    ...modelParameterRows(modelParameters),
  ].filter((row) => row.value !== "");

  return (
    <div className="flex w-full flex-col gap-6 overflow-y-auto p-2">
      <section className="flex flex-col gap-2 px-2">
        <h3 className="text-muted-foreground text-xs">Attributes</h3>
        {rows.length > 0 ? (
          <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-1.5 text-xs">
            {rows.map((row) => (
              <div key={row.key} className="contents">
                <dt className="text-muted-foreground font-mono">{row.key}</dt>
                <dd
                  className="text-foreground/90 truncate font-mono"
                  title={row.value}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-muted-foreground text-xs italic">
            No attributes on this observation.
          </p>
        )}
      </section>

      {parsedMetadata !== undefined ? (
        <div className="[&_.io-message-content]:px-2 [&_.io-message-header]:px-2">
          <PrettyJsonView
            title="Metadata"
            json={parsedMetadata}
            isLoading={isLoading}
            isParsing={isParsing}
            media={media?.filter((m) => m.field === "metadata") ?? []}
            currentView="pretty"
            hoverControls
          />
        </div>
      ) : null}
    </div>
  );
}
