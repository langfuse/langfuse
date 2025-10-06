import { getScoreDataTypeIcon } from "@/src/features/scores/lib/scoreColumns";
import { type ScoreDataType } from "@langfuse/shared";

export const resolveConfigValue = ({
  name,
  dataType,
}: {
  name: string;
  dataType: ScoreDataType;
}) => {
  return `${getScoreDataTypeIcon(dataType)} ${name}`;
};
