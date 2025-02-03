import { api } from "@/src/utils/api";

export const queryHooks = {
  "annotationQueues.allNamesAndIds":
    api.annotationQueues.allNamesAndIds.useQuery,
} as const;
