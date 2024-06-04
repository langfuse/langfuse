import {
  isNumericDataType,
  isPresent,
} from "@/src/features/manual-scoring/lib/helpers";
import { type ScoreConfig } from "@langfuse/shared";
import React from "react";

export function ScoreConfigDetails({ config }: { config: ScoreConfig }) {
  const { name, description, minValue, maxValue, dataType } = config;
  if (!description && !minValue && !maxValue) return null;
  const isNameTruncated = name.length > 20;

  return (
    <div className="max-w-48 overflow-hidden text-wrap rounded border bg-background p-2 text-xs font-light">
      {!!description && <p>{`Description: ${description}`}</p>}
      {isNumericDataType(dataType) &&
      (isPresent(minValue) || isPresent(maxValue)) ? (
        <p>{`Range: [${minValue ?? "-∞"}, ${maxValue ?? "∞"}]`}</p>
      ) : null}
      {isNameTruncated && <p>{`Full name: ${name}`}</p>}
    </div>
  );
}
