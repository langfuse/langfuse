import { getGenerationLikeTypes, ObservationType } from "@langfuse/shared";

export const getDefaultObservationTypeFilter = ({
  hasPromptFilter,
}: {
  hasPromptFilter: boolean;
}) => {
  const defaultTypes = getGenerationLikeTypes();

  if (!hasPromptFilter) {
    return defaultTypes;
  }

  return [...defaultTypes, ObservationType.SPAN];
};
