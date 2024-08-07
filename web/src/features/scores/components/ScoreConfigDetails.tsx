import { isNumericDataType } from "@/src/features/scores/lib/helpers";
import { type ValidatedScoreConfig } from "@/src/features/public-api/types/score-configs";
import { isPresent } from "@/src/utils/typeChecks";
import React from "react";

export function ScoreConfigDetails({
  config,
}: {
  config: ValidatedScoreConfig;
}) {
  const { name, description, minValue, maxValue, dataType } = config;
  if (!description && !isPresent(minValue) && !isPresent(maxValue)) return null;
  const isNameTruncated = name.length > 20;

  return (
    <div className="text-wrap bg-background p-2 text-xs font-light">
      {!!description && <p>{`Description: ${description}`}</p>}
      {isNumericDataType(dataType) &&
      (isPresent(minValue) || isPresent(maxValue)) ? (
        <p>{`Range: [${minValue ?? "-∞"}, ${maxValue ?? "∞"}]`}</p>
      ) : null}
      {isNameTruncated && <p>{`Full name: ${name}`}</p>}
    </div>
  );
}
