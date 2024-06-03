import { isNumeric } from "@/src/features/manual-scoring/lib/helpers";
import { type ScoreConfig } from "@langfuse/shared";
import React from "react";

export function ScoreConfigDetails({ config }: { config: ScoreConfig }) {
  const { description, minValue, maxValue, dataType } = config;
  if (!description && !minValue && !maxValue) return null;

  return (
    <div className="max-w-48 overflow-hidden rounded border bg-background p-2 text-xs font-light">
      {!!description && <p>{`Description: ${description}`}</p>}
      {isNumeric(dataType) && (!!minValue || !!maxValue) ? (
        <p>{`Range: [${minValue ?? "-∞"}, ${maxValue ?? "∞"}]`}</p>
      ) : null}
    </div>
  );
}
