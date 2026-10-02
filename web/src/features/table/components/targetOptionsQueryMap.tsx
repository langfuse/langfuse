import { api } from "@/src/utils/api";

// Thunks, not hook references: a module-scope `api.x.y.useQuery` makes every
// importer of this file — including anything reaching it through a feature
// barrel — evaluate the tRPC proxy at import time.
export const targetOptionsQueryMap = {
  "trace-add-to-annotation-queue": () =>
    api.annotationQueues.allNamesAndIds.useQuery,
  "session-add-to-annotation-queue": () =>
    api.annotationQueues.allNamesAndIds.useQuery,
  "observation-add-to-annotation-queue": () =>
    api.annotationQueues.allNamesAndIds.useQuery,
} as const;
