import { isNumeric } from "@/src/features/manual-scoring/lib/helpers";
import { type ScoreConfig } from "@langfuse/shared";
import React from "react";

export function ScoreConfigDetails({
  configId,
  configs,
}: {
  configId?: string;
  configs?: ScoreConfig[];
}) {
  if (!configId) return null;
  const config = configs?.find((config) => config.id === configId);
  if (!config) return null;
  const { description, minValue, maxValue, dataType } = config;

  return (
    <div className="max-w-48 overflow-hidden rounded border bg-background p-2 text-xs font-light">
      {!!description && <p>{`Description: ${description}`}</p>}
      {isNumeric(dataType) && (!!minValue || !!maxValue) ? (
        <p>{`Range: [${minValue ?? "-∞"}, ${maxValue ?? "∞"}]`}</p>
      ) : null}
    </div>
  );
}
