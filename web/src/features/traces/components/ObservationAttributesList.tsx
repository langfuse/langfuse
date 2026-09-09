/**
 * Light two-column key/value list for an observation's fixed-key attributes
 * (model, environment, release, version, model parameters). Shared by the
 * Preview tab and the Attributes tab so both render the same rows.
 */

import { type JsonNested } from "@langfuse/shared";

export type AttributeRow = { key: string; value: string };

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

export function buildObservationAttributeRows({
  model,
  environment,
  release,
  version,
  modelParameters,
}: {
  model: string | null;
  environment: string | null;
  release: string | null | undefined;
  version: string | null;
  modelParameters: JsonNested | null | undefined;
}): AttributeRow[] {
  return [
    { key: "model", value: model ?? "" },
    { key: "environment", value: environment ?? "" },
    { key: "release", value: release ?? "" },
    { key: "version", value: version ?? "" },
    ...modelParameterRows(modelParameters),
  ].filter((row) => row.value !== "");
}

export function ObservationAttributesList({ rows }: { rows: AttributeRow[] }) {
  return (
    <section className="flex flex-col gap-2">
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
  );
}
