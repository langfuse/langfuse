import { type ScoreColumnAggregate } from "./summariseScoreColumn";

export const formatScoreValue = (value: number) => value.toFixed(2);

/** How a score column's aggregate reads, which depends on the score's type. */
export const formatScoreColumnAggregate = (aggregate: ScoreColumnAggregate) => {
  if (aggregate.kind === "average")
    return `Ø ${formatScoreValue(aggregate.value)}`;
  if (aggregate.kind === "trueRate")
    return `${Math.round(aggregate.value * 100)}% true`;
  const modalCount =
    aggregate.distribution.find((entry) => entry.value === aggregate.modalValue)
      ?.count ?? 0;
  return `${aggregate.modalValue} ${modalCount}/${aggregate.count}`;
};
