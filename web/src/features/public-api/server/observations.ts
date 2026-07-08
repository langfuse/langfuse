import {
  generateObservationsForPublicApi as _generateObservationsForPublicApi,
  getObservationsCountForPublicApi as _getObservationsCountForPublicApi,
  createPublicApiObservationsColumnMapping,
  deriveFilters,
  StringFilter,
  observationsTableUiColumnDefinitions,
} from "@langfuse/shared/src/server";
import { observationsTableCols } from "@langfuse/shared";
import type { FilterState } from "@langfuse/shared";

type ObservationsApiQueryProps = {
  page: number;
  limit: number;
  projectId: string;
  traceId?: string;
  userId?: string;
  level?: string;
  name?: string;
  type?: string;
  environment?: string | string[];
  parentObservationId?: string;
  fromStartTime?: string;
  toStartTime?: string;
  version?: string;
  advancedFilters?: FilterState;
};

const publicApiObservationsFilterParams =
  createPublicApiObservationsColumnMapping(
    "observations",
    "o",
    "parent_observation_id",
  );

function buildObservationsFilter(props: ObservationsApiQueryProps) {
  const { advancedFilters, ...simpleFilterProps } = props;
  const chFilter = deriveFilters(
    simpleFilterProps,
    publicApiObservationsFilterParams,
    advancedFilters,
    observationsTableUiColumnDefinitions.filter(
      (c) => c.clickhouseTableName !== "scores",
    ),
    observationsTableCols,
  );

  const filteredChFilter = chFilter.filter(
    (f) => f.clickhouseTable !== "scores",
  );

  filteredChFilter.push(
    new StringFilter({
      clickhouseTable: "observations",
      field: "project_id",
      operator: "=",
      value: props.projectId,
    }),
  );
  return filteredChFilter;
}

export const generateObservationsForPublicApi = (
  props: ObservationsApiQueryProps,
) => {
  const filter = buildObservationsFilter(props);
  return _generateObservationsForPublicApi({
    projectId: props.projectId,
    filter,
    pagination: { limit: props.limit, page: props.page },
  });
};

export const getObservationsCountForPublicApi = (
  props: ObservationsApiQueryProps,
) => {
  const filter = buildObservationsFilter(props);
  return _getObservationsCountForPublicApi({
    projectId: props.projectId,
    filter,
  });
};
